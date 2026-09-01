import { writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { OpenVPNProvider, type OpenVPNCommandRunner, type OpenVPNCredentialStore } from './openvpn.js';
import type { TunnelConfiguration } from './index.js';

const CLIENT_CONFIG = `client\ndev tun\nproto udp\nremote vpn.example.test 1194\nverb 3\n`;

function config(): TunnelConfiguration {
  return {
    endpoint: { host: '198.51.100.20', port: 1194, protocol: 'openvpn', addressFamily: 'ipv4', metadata: {} },
    routingMode: 'fullTunnel', scope: 'system', dnsMode: 'insideTunnel',
    authentication: { type: 'certificate', credentialRef: 'cred:openvpn' }, credentialRef: 'cred:openvpn',
    securityProfile: 'strict', capabilities: ['ipv4', 'udp', 'tcp', 'fullTunnel', 'systemWide', 'authentication', 'keepalive', 'reconnect', 'healthCheck'],
    keepalive: { enabled: true, intervalMs: 25_000, timeoutMs: 5_000 }, mtu: { validationStatus: 'valid' }, timeoutMs: 30_000, retryLimit: 2,
  };
}

class FakeRunner implements OpenVPNCommandRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  private readonly responses: Array<{ stdout: string; stderr: string; exitCode: number }> = [];
  queue(response: { stdout: string; stderr: string; exitCode: number }): void { this.responses.push(response); }
  async run(command: string, args: string[]) {
    this.calls.push({ command, args: [...args] });
    return this.responses.shift() ?? { stdout: '', stderr: '', exitCode: 0 };
  }
}

const credentialStore: OpenVPNCredentialStore = { getClientConfig: vi.fn(async () => CLIENT_CONFIG) };

describe('OpenVPNProvider', () => {
  it('creates a configured tunnel without persisting the client profile', async () => {
    const provider = new OpenVPNProvider({ credentialStore });
    const tunnel = await provider.create(config());
    expect(tunnel.providerId).toBe('openvpn');
    expect(tunnel.configuration.credentialRef).toBe('cred:openvpn');
    expect(JSON.stringify(tunnel)).not.toContain('vpn.example.test');
  });

  it('rejects unauthenticated OpenVPN configuration', async () => {
    const provider = new OpenVPNProvider({ credentialStore });
    const error = await provider.create({ ...config(), authentication: { type: 'none' } }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: 'TunnelAuthenticationFailed',
      classification: 'securityFailure',
      retryable: false,
    });
  });

  it('rejects a missing credential reference', async () => {
    const provider = new OpenVPNProvider({ credentialStore });
    const { credentialRef: _credentialRef, ...withoutCredential } = config();
    await expect(provider.create(withoutCredential)).rejects.toThrow(/credential reference/);
  });

  it('rejects executable script hooks in credential-managed profiles', async () => {
    const provider = new OpenVPNProvider({ credentialStore: { getClientConfig: vi.fn(async () => `${CLIENT_CONFIG}\nup /tmp/unsafe-hook`) } });
    const tunnel = await provider.create(config());
    await expect(provider.connect(tunnel)).rejects.toThrow(/script hooks/);
  });

  it('starts OpenVPN without passing credential material as process arguments', async () => {
    const runner = new FakeRunner();
    runner.queue({ stdout: '', stderr: 'startup failed', exitCode: 1 });
    const provider = new OpenVPNProvider({ commandRunner: runner, credentialStore });
    const tunnel = await provider.create(config());
    await expect(provider.connect(tunnel)).rejects.toThrow(/startup failed/);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.args).toContain('--config');
    expect(runner.calls[0]?.args.join(' ')).not.toContain(CLIENT_CONFIG);
  });

  it('sanitizes certificate material from dependency failures', async () => {
    const certificate = '-----BEGIN CERTIFICATE-----\nSECRET-CERTIFICATE\n-----END CERTIFICATE-----';
    const runner = new FakeRunner();
    runner.queue({ stdout: '', stderr: certificate, exitCode: 1 });
    const provider = new OpenVPNProvider({ commandRunner: runner, credentialStore });
    const tunnel = await provider.create(config());
    await expect(provider.connect(tunnel)).rejects.not.toThrow(/SECRET-CERTIFICATE/);
  });

  it('waits for connected evidence before reporting a successful connection', async () => {
    const runner: OpenVPNCommandRunner = {
      async run(_command, args) {
        const pidPath = args[args.indexOf('--writepid') + 1];
        const statusPath = args[args.indexOf('--status') + 1];
        if (!pidPath || !statusPath) throw new Error('missing runtime paths');
        await writeFile(pidPath, '99999\n');
        await writeFile(statusPath, 'TITLE,OpenVPN 2.6\n');
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };
    let alive = true;
    const kill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal !== 0) alive = false;
      if (signal === 0 && !alive) throw Object.assign(new Error('not alive'), { code: 'ESRCH' });
      return undefined as never;
    });
    try {
      const provider = new OpenVPNProvider({
        commandRunner: runner,
        credentialStore,
        startupTimeoutMs: 20,
        pollIntervalMs: 1,
        commandTimeoutMs: 20,
      });
      const tunnel = await provider.create(config());
      await expect(provider.connect(tunnel)).rejects.toThrow(/healthy tunnel evidence/);
    } finally {
      kill.mockRestore();
    }
  });

  it('exposes bounded provider capabilities', () => {
    const provider = new OpenVPNProvider({ credentialStore, commandTimeoutMs: 30_000, startupTimeoutMs: 15_000 });
    expect(provider.protocol).toBe('openvpn');
    expect(provider.supportedScopes).toEqual(['system']);
    expect(provider.supportedRoutingModes).toEqual(['fullTunnel', 'splitTunnel']);
    expect(provider.capabilities).toContain('healthCheck');
    expect(provider.capabilities).toContain('reconnect');
  });
});
