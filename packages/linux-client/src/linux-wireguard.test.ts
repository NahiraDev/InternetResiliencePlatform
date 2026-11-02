import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLinuxWireGuardIntegrationFromEnvironment,
  parseLinuxWireGuardConfiguration,
  SystemdWireGuardCredentialStore,
} from './linux-wireguard.js';
import type { CommandRunner } from '@irp/tunnel/wireguard';

const PRIVATE_KEY = `${'A'.repeat(43)}=`;
const PUBLIC_KEY = `${'B'.repeat(43)}=`;
const credentialDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(credentialDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

const environment = (overrides: Record<string, string> = {}): Record<string, string> => ({
  IRP_TUNNEL_ENABLED: '1',
  IRP_WIREGUARD_ENDPOINT_HOST: '198.51.100.10',
  IRP_WIREGUARD_ENDPOINT_PORT: '51820',
  IRP_WIREGUARD_PEER_PUBLIC_KEY: PUBLIC_KEY,
  IRP_WIREGUARD_ALLOWED_IPS: '10.20.0.0/16',
  IRP_WIREGUARD_ADDRESS_CIDR: '10.20.0.2/24',
  IRP_WIREGUARD_CREDENTIAL_REF: 'irp_wireguard_private_key',
  IRP_WIREGUARD_ROUTING_MODE: 'splitTunnel',
  ...overrides,
});

class FakeWireGuardCommandRunner implements CommandRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  private interfaceCreated = false;

  async run(command: string, args: string[]) {
    this.calls.push({ command, args: [...args] });
    if (command === 'ip' && args[0] === 'link' && args[1] === 'show') {
      return this.interfaceCreated
        ? { stdout: '7: irpwg0: <POINTOPOINT,UP,LOWER_UP> state UP\n', stderr: '', exitCode: 0 }
        : { stdout: '', stderr: 'Device not found', exitCode: 1 };
    }
    if (command === 'ip' && args[0] === 'link' && args[1] === 'add') this.interfaceCreated = true;
    if (command === 'ip' && args[0] === 'link' && args[1] === 'del') this.interfaceCreated = false;
    if (command === 'wg' && args[0] === 'show') {
      return { stdout: `peer ${Math.floor(Date.now() / 1000) - 1}\n`, stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }
}

describe('Linux WireGuard configuration', () => {
  it('is disabled unless the operator explicitly enables the tunnel', () => {
    expect(createLinuxWireGuardIntegrationFromEnvironment({})).toBeUndefined();
  });

  it('parses strict split-tunnel provider configuration', () => {
    const parsed = parseLinuxWireGuardConfiguration(environment());
    expect(parsed.interfaceName).toBe('irpwg0');
    expect(parsed.allowedIPs).toEqual(['10.20.0.0/16']);
    expect(parsed.tunnel).toMatchObject({
      routingMode: 'splitTunnel',
      endpoint: { host: '198.51.100.10', port: 51820, protocol: 'wireguard' },
      credentialRef: 'irp_wireguard_private_key',
      authentication: { type: 'key', credentialRef: 'irp_wireguard_private_key' },
      splitTunnel: { includedDestinations: ['10.20.0.0/16'], precedence: 'include' },
    });
  });

  it('rejects incomplete or unsafe provider configuration before startup', () => {
    expect(() => parseLinuxWireGuardConfiguration(environment({
      IRP_WIREGUARD_PEER_PUBLIC_KEY: 'not-a-key',
    }))).toThrow(/public key/);
    expect(() => parseLinuxWireGuardConfiguration(environment({
      IRP_WIREGUARD_CREDENTIAL_REF: '../private-key',
    }))).toThrow(/credential name/);
    expect(() => parseLinuxWireGuardConfiguration(environment({
      IRP_WIREGUARD_ALLOWED_IPS: '0.0.0.0/0,not-a-cidr',
    }))).toThrow(/CIDR/);
    expect(() => parseLinuxWireGuardConfiguration(environment({
      IRP_WIREGUARD_ROUTING_MODE: 'fullTunnel',
    }))).toThrow(/splitTunnel only/);
  });
});

describe('SystemdWireGuardCredentialStore', () => {
  it('reads a private key from a private regular credential file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'irp-wg-credentials-'));
    credentialDirectories.push(directory);
    const path = join(directory, 'irp_wireguard_private_key');
    await writeFile(path, `${PRIVATE_KEY}\n`, { mode: 0o600 });
    const store = new SystemdWireGuardCredentialStore(directory);
    await expect(store.getPrivateKey('irp_wireguard_private_key')).resolves.toBe(PRIVATE_KEY);
  });

  it('rejects path traversal, symlinks and credentials accessible by group or others', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'irp-wg-credentials-'));
    credentialDirectories.push(directory);
    const path = join(directory, 'private-key');
    const target = join(directory, 'target');
    await writeFile(target, PRIVATE_KEY, { mode: 0o600 });
    await symlink(target, path);
    const store = new SystemdWireGuardCredentialStore(directory);
    await expect(store.getPrivateKey('../target')).rejects.toThrow(/reference is invalid/);
    await expect(store.getPrivateKey('private-key')).rejects.toThrow(/unavailable or unsafe/);
    await rm(path);
    await writeFile(path, PRIVATE_KEY, { mode: 0o644 });
    await chmod(path, 0o644);
    await expect(store.getPrivateKey('private-key')).rejects.toThrow(/permissions/);
  });

  it('requires systemd credentials when an enabled provider is constructed', () => {
    expect(() => new SystemdWireGuardCredentialStore('')).toThrow(/CREDENTIALS_DIRECTORY/);
  });
});

describe('Linux WireGuard canonical control-plane integration', () => {
  it('registers the real provider and verifies its handshake through TunnelRegistryControlPlane', async () => {
    const commandRunner = new FakeWireGuardCommandRunner();
    const integration = createLinuxWireGuardIntegrationFromEnvironment(environment(), {
      credentialStore: { getPrivateKey: async () => PRIVATE_KEY },
      commandRunner,
    });
    expect(integration?.controlPlane.configured).toBe(true);
    expect(integration?.registry.get('wireguard')).toBe(integration?.provider);

    const connection = await integration!.controlPlane.connect();
    expect(connection.providerId).toBe('wireguard');
    await expect(integration!.controlPlane.verify(connection.tunnelId)).resolves.toBe(true);
    await expect(integration!.controlPlane.rollback()).resolves.toBe(true);
    expect(commandRunner.calls.some((call) => call.command === 'wg' && call.args[0] === 'set')).toBe(true);
    expect(commandRunner.calls.some((call) => call.command === 'ip' && call.args[0] === 'address')).toBe(true);
  });
});
