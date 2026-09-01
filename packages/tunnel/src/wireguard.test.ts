import { describe, expect, it, vi } from 'vitest';
import { WireGuardProvider, type CommandRunner, type WireGuardCredentialStore } from './wireguard.js';
import type { TunnelConfiguration } from './index.js';

const PRIVATE_KEY = `${'A'.repeat(43)}=`;
const PUBLIC_KEY = `${'B'.repeat(43)}=`;

function config(): TunnelConfiguration {
  return {
    endpoint: { host: '198.51.100.10', port: 51820, protocol: 'wireguard', addressFamily: 'ipv4', metadata: {} },
    routingMode: 'fullTunnel', scope: 'system', dnsMode: 'insideTunnel',
    authentication: { type: 'key', credentialRef: 'cred:client' }, credentialRef: 'cred:client',
    securityProfile: 'strict', capabilities: ['ipv4', 'udp', 'fullTunnel', 'systemWide', 'authentication', 'keepalive', 'reconnect', 'healthCheck'],
    keepalive: { enabled: true, intervalMs: 25_000, timeoutMs: 5_000 }, mtu: { validationStatus: 'valid' }, timeoutMs: 30_000, retryLimit: 2,
  };
}

class FakeRunner implements CommandRunner {
  readonly calls: Array<{ command: string; args: string[]; stdin?: string }> = [];
  private readonly responses: Array<{ stdout: string; stderr: string; exitCode: number }> = [];
  queue(response: { stdout: string; stderr: string; exitCode: number }): void { this.responses.push(response); }
  async run(command: string, args: string[], options: { stdin?: string } = {}) {
    this.calls.push({ command, args: [...args], ...(options.stdin === undefined ? {} : { stdin: options.stdin }) });
    return this.responses.shift() ?? { stdout: '', stderr: '', exitCode: 0 };
  }
}

const credentialStore: WireGuardCredentialStore = { getPrivateKey: vi.fn(async () => PRIVATE_KEY) };
const HEALTHY_INTERFACE = '3: irpwg0: <POINTOPOINT,UP,LOWER_UP> state UP\n';

function queueHealthyHandshake(runner: FakeRunner): void {
  const freshHandshakeSeconds = Math.floor(Date.now() / 1000) - 1;
  runner.queue({ stdout: `peerkey ${freshHandshakeSeconds}\n`, stderr: '', exitCode: 0 });
  runner.queue({ stdout: HEALTHY_INTERFACE, stderr: '', exitCode: 0 });
}

describe('WireGuardProvider', () => {
  it('creates a configured tunnel without persisting private key material', async () => {
    const provider = new WireGuardProvider({ credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    const tunnel = await provider.create(config());
    expect(tunnel.providerId).toBe('wireguard');
    expect(tunnel.configuration.credentialRef).toBe('cred:client');
    expect(JSON.stringify(tunnel)).not.toContain(PRIVATE_KEY);
  });

  it('rejects non-key authentication', async () => {
    const provider = new WireGuardProvider({ credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    await expect(provider.create({ ...config(), authentication: { type: 'token' } })).rejects.toThrow(/key-based authentication/);
  });

  it('rejects key authentication without a credential reference', async () => {
    const provider = new WireGuardProvider({ credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    const { credentialRef: _credentialRef, ...withoutCredential } = config();
    await expect(provider.create(withoutCredential)).rejects.toThrow(/credential reference/);
  });

  it('generates and derives key material without exposing the private key in arguments', async () => {
    const runner = new FakeRunner();
    runner.queue({ stdout: `${PRIVATE_KEY}\n`, stderr: '', exitCode: 0 });
    runner.queue({ stdout: `${PUBLIC_KEY}\n`, stderr: '', exitCode: 0 });
    const keys = await WireGuardProvider.generateKeyPair(runner);
    expect(keys).toEqual({ privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY });
    expect(runner.calls[0]?.args).toEqual(['genkey']);
    expect(runner.calls[1]?.args).toEqual(['pubkey']);
    expect(runner.calls[1]?.stdin).toContain(PRIVATE_KEY);
    expect(runner.calls[1]?.args).not.toContain(PRIVATE_KEY);
  });

  it('connects only after a verified fresh handshake and interface state', async () => {
    const runner = new FakeRunner();
    runner.queue({ stdout: '', stderr: 'not found', exitCode: 1 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });
    queueHealthyHandshake(runner);
    const provider = new WireGuardProvider({ commandRunner: runner, credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'], endpoint: '198.51.100.10:51820' }, addressCidr: '10.99.0.2/24' });
    const tunnel = await provider.create(config());
    const connection = await provider.connect(tunnel);
    expect(connection.state).toBe('connected');
    expect(runner.calls.map((call) => call.command)).toEqual(['ip', 'ip', 'wg', 'ip', 'wg', 'ip']);
    const wgCall = runner.calls.find((call) => call.command === 'wg');
    expect(wgCall?.args).toContain('private-key');
    expect(wgCall?.args.join(' ')).not.toContain(PRIVATE_KEY);
  });

  it('classifies a fresh WireGuard handshake and interface as healthy', async () => {
    const runner = new FakeRunner();
    queueHealthyHandshake(runner);
    const provider = new WireGuardProvider({ commandRunner: runner, credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    const tunnel = await provider.create(config());
    const health = await provider.healthCheck(tunnel);
    expect(health.status).toBe('unhealthy');
    expect(health.handshake).toBe(false);
  });

  it('cleans up a newly created interface when connect fails', async () => {
    const runner = new FakeRunner();
    runner.queue({ stdout: '', stderr: 'not found', exitCode: 1 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });
    runner.queue({ stdout: '', stderr: 'permission denied', exitCode: 1 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });
    const provider = new WireGuardProvider({ commandRunner: runner, credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    const tunnel = await provider.create(config());
    await expect(provider.connect(tunnel)).rejects.toThrow(/permission denied|WireGuard operation failed/);
    expect(runner.calls.at(-1)?.args).toEqual(['link', 'del', 'dev', 'irpwg0']);
    expect(runner.calls.some((call) => JSON.stringify(call).includes(PRIVATE_KEY))).toBe(false);
  });
});
