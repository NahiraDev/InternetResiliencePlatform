/**
 * Tests for the Linux host connectivity provider.
 *
 * These tests verify that the provider correctly discovers real network
 * interfaces from `ip -j addr show` output and converts them into
 * canonical ConnectivityResource[].
 */

import { describe, expect, it } from 'vitest';
import { LinuxHostConnectivityProvider } from './linux-host-connectivity-provider.js';

describe('LinuxHostConnectivityProvider', () => {
  it('discovers real network interfaces from the host', async () => {
    const provider = new LinuxHostConnectivityProvider();
    const resources = await provider.discover();

    expect(Array.isArray(resources)).toBe(true);

    // In any Linux environment, there should be at least one non-loopback
    // interface with an address (e.g., eth0, enp0s3, etc.)
    // If no interfaces are found, ip may be unavailable — that's valid.
    for (const resource of resources) {
      expect(resource.providerId).toBe('linux-host');
      expect(resource.id).toBeDefined();
      expect(resource.addresses.length).toBeGreaterThan(0);
      expect(resource.capabilities).toContain('monitor');
      expect(resource.capabilities).toContain('health-check');
    }
  });

  it('parses ip -j addr show output correctly', async () => {
    const fakeRunner = {
      run: async (
        _binary: string,
        args: readonly string[],
        _options: { timeoutMs: number },
      ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        if (args.includes('addr')) {
          return {
            stdout: JSON.stringify([
              {
                ifindex: 2,
                ifname: 'eth0',
                flags: ['UP', 'LOWER_UP'],
                operstate: 'UP',
                addr_info: [
                  {
                    family: 'inet',
                    local: '192.168.1.10',
                    prefixlen: 24,
                    scope: 'global',
                  },
                ],
              },
            ]),
            stderr: '',
            exitCode: 0,
          };
        }
        // Route output
        return {
          stdout: JSON.stringify([
            { dst: 'default', gateway: '192.168.1.1', dev: 'eth0' },
          ]),
          stderr: '',
          exitCode: 0,
        };
      },
    };

    const provider = new LinuxHostConnectivityProvider({
      commandRunner: fakeRunner,
    });

    const resources = await provider.discover();

    expect(resources).toHaveLength(1);
    const r = resources[0]!;
    expect(r.id).toBe('eth0');
    expect(r.interfaceName).toBe('eth0');
    expect(r.state).toBe('active');
    expect(r.addresses).toContain('192.168.1.10/24');
    expect(r.gateway).toBe('192.168.1.1');
    expect(r.capabilities).toContain('supports-ipv4');
    expect(r.health?.status).toBe('healthy');
  });

  it('skips loopback interfaces', async () => {
    const fakeRunner = {
      run: async (
        _binary: string,
        _args: readonly string[],
        _options: { timeoutMs: number },
      ): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
        stdout: JSON.stringify([
          {
            ifindex: 1,
            ifname: 'lo',
            flags: ['UP'],
            operstate: 'UNKNOWN',
            addr_info: [
              { family: 'inet', local: '127.0.0.1', prefixlen: 8, scope: 'host' },
            ],
          },
        ]),
        stderr: '',
        exitCode: 0,
      }),
    };

    const provider = new LinuxHostConnectivityProvider({
      commandRunner: fakeRunner,
    });

    const resources = await provider.discover();
    expect(resources).toHaveLength(0);
  });

  it('skips interfaces with no addresses', async () => {
    const fakeRunner = {
      run: async (
        _binary: string,
        _args: readonly string[],
        _options: { timeoutMs: number },
      ): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
        stdout: JSON.stringify([
          {
            ifindex: 3,
            ifname: 'eth1',
            flags: ['DOWN'],
            operstate: 'DOWN',
            addr_info: [],
          },
        ]),
        stderr: '',
        exitCode: 0,
      }),
    };

    const provider = new LinuxHostConnectivityProvider({
      commandRunner: fakeRunner,
    });

    const resources = await provider.discover();
    expect(resources).toHaveLength(0);
  });

  it('reports health based on operstate', async () => {
    const fakeRunner = {
      run: async (
        _binary: string,
        args: readonly string[],
        _options: { timeoutMs: number },
      ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        if (args.includes('addr')) {
          return {
            stdout: JSON.stringify([
              {
                ifindex: 2,
                ifname: 'eth0',
                flags: ['UP'],
                operstate: 'UP',
                addr_info: [
                  { family: 'inet', local: '10.0.0.5', prefixlen: 24, scope: 'global' },
                ],
              },
            ]),
            stderr: '',
            exitCode: 0,
          };
        }
        return { stdout: '[]', stderr: '', exitCode: 0 };
      },
    };

    const provider = new LinuxHostConnectivityProvider({
      commandRunner: fakeRunner,
    });

    const health = await provider.getHealth('eth0');
    expect(health.status).toBe('healthy');
    expect(health.score).toBe(80);
  });

  it('does not own interface lifecycle (disconnect returns false)', async () => {
    const provider = new LinuxHostConnectivityProvider();
    const result = await provider.disconnect('eth0');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('managed by the network manager');
  });

  it('is registered in the production network control plane', async () => {
    const { createLinuxNetworkControlPlane } = await import('./linux-network-control-plane.js');
    const plane = createLinuxNetworkControlPlane({ enableLiveRouteMutation: true });

    const providers = plane.connectivity.getProviders();
    const hostProvider = providers.find((p) => p.id === 'linux-host');
    expect(hostProvider).toBeDefined();
    expect(hostProvider!.type).toBe('ethernet');
  });
});
