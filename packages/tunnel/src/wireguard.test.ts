import { describe, expect, it, vi } from 'vitest';
import { WireGuardProvider, type CommandRunner, type WireGuardCredentialStore } from './wireguard.js';
import type { TunnelConfiguration } from './index.js';

const PRIVATE_KEY = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=='.slice(0, 44);
const PUBLIC_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=='.slice(0, 44);

function config(): TunnelConfiguration {
  return {
    endpoint: { host: '198.51.100.10', port: 51820, protocol: 'wireguard', addressFamily: 'ipv4', metadata: {} },
    routingMode: 'fullTunnel',
    scope: 'system',
    dnsMode: 'insideTunnel',
    authentication: { type: 'key', credentialRef: 'cred:client' },
    credentialRef: 'cred:client',
    securityProfile: 'strict',
    capabilities: ['ipv4', 'udp', 'fullTunnel', 'systemWide', 'authentication', 'keepalive', 'reconnect', 'healthCheck'],
    keepalive: { enabled: true, intervalMs: 25_000, timeoutMs: 5_000 },
    mtu: { validationStatus: 'valid' },
    timeoutMs: 30_000,
    retryLimit: 2,
  };
}

class FakeRunner implements CommandRunner {
  readonly calls: Array<{ command: string; args: string[]; stdin?: string }> = [];
  private readonly responses: CommandRunner['run'][] = [];

  queue(response: Awaited<ReturnType<CommandRunner['run']>>): void {
    this.responses.push(async () => response);
  }

  async run(command: string, args: string[], options: { stdin?: string } = {}) {
    this.calls.push({ command, args: [...args], ...(options.stdin === undefined ? {} : { stdin: options.stdin }) });
    const response = this.responses.shift();
    return response ? response(command, args, options) : { stdout: '', stderr: '', exitCode: 0 };
  }
}

const credentialStore: WireGuardCredentialStore = { getPrivateKey: vi.fn(async () => PRIVATE_KEY) };

describe('WireGuardProvider', () => {
  it('creates a configured tunnel without persisting private key material', async () => {
    const provider = new WireGuardProvider({ credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    const tunnel = await provider.create(config());

    expect(tunnel.providerId).toBe('wireguard');
    expect(tunnel.configuration.credentialRef).toBe('cred:client');
    expect(JSON.stringify(tunnel)).not.toContain(PRIVATE_KEY);
  });

  it('rejects non-key authentication and missing credential reference', async () => {
    const provider = new WireGuardProvider({ credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    await expect(provider.create({ ...config(), authentication: { type: 'token' }, credentialRef: undefined })).rejects.toThrow(/key-based authentication|credential reference/);
  });

  it('generates and derives key material through wg commands without exposing it in arguments', async () => {
    const runner = new FakeRunner();
    runner.queue({ stdout: `${PRIVATE_KEY}\n`, stderr: '', exitCode: 0 });
    runner.queue({ stdout: `${PUBLIC_KEY}\n`, stderr: '', exitCode: 0 });

    const keys = await WireGuardProvider.generateKeyPair(runner);
    expect(keys).toEqual({ privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY });
    expect(runner.calls[0]?.command).toBe('wg');
    expect(runner.calls[0]?.args).toEqual(['genkey']);
    expect(runner.calls[1]?.args).toEqual(['pubkey']);
    expect(runner.calls[1]?.stdin).toContain(PRIVATE_KEY);
    expect(runner.calls[1]?.args).not.toContain(PRIVATE_KEY);
  });

  it('connects using bounded, non-shell commands and removes the private-key temp file', async () => {
    const runner = new FakeRunner();
    runner.queue({ stdout: '', stderr: 'not found', exitCode: 1 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });

    const provider = new WireGuardProvider({
      commandRunner: runner,
      credentialStore,
      peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'], endpoint: '198.51.100.10:51820' },
      addressCidr: '10.99.0.2/24',
    });
    const tunnel = await provider.create(config());
    const connection = await provider.connect(tunnel);

    expect(connection.state).toBe('connected');
    expect(runner.calls.map((call) => call.command)).toEqual(['ip', 'ip', 'wg', 'ip', 'ip']);
    expect(runner.calls.find((call) => call.command === 'wg')?.args).toContain('private-key');
    expect(runner.calls.find((call) => call.command === 'wg')?.args.join(' ')).not.toContain(PRIVATE_KEY);
  });

  it('classifies a fresh WireGuard handshake and interface as healthy', async () => {
    const runner = new FakeRunner();
    runner.queue({ stdout: 'peerkey 4294967295\n', stderr: '', exitCode: 0 });
    runner.queue({ stdout: '3: irpwg0: <POINTOPOINT,UP,LOWER_UP> state UP\n', stderr: '', exitCode: 0 });
    const provider = new WireGuardProvider({ commandRunner: runner, credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    const tunnel = await provider.create(config());
    await provider.connect(Object.assign(tunnel, { state: 'configured' }));
    const health = await provider.healthCheck(tunnel);

    expect(health.status).toBe('healthy');
    expect(health.handshake).toBe(true);
  });

  it('does not log private key material when the command fails', async () => {
    const runner = new FakeRunner();
    runner.queue({ stdout: '', stderr: 'show', exitCode: 1 });
    runner.queue({ stdout: '', stderr: '', exitCode: 0 });
    runner.queue({ stdout: '', stderr: 'permission denied', exitCode: 1 });

    const provider = new WireGuardProvider({ commandRunner: runner, credentialStore, peer: { publicKey: PUBLIC_KEY, allowedIPs: ['0.0.0.0/0'] } });
    const tunnel = await provider.create(config());
    await expect(provider.connect(tunnel)).rejects.toThrow(/permission denied|WireGuard operation failed/);
    expect(runner.calls.some((call) => JSON.stringify(call).includes(PRIVATE_KEY))).toBe(false);
  });
});
