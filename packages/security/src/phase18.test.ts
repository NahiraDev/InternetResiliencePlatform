import { describe, expect, it } from 'vitest';
import {
  NetworkSecurityProtectionEngine,
  classifyDnsLeak,
  createExpectedNetworkState,
  createTrafficProtectionPolicy,
  detectRouteLeaks,
  type ObservedNetworkState,
  type Phase18KillSwitch,
} from './index.js';

const observed = (extra: Partial<ObservedNetworkState> = {}): ObservedNetworkState => ({
  activeInterfaces: ['tun0'],
  activeRoutes: [
    {
      destination: '0.0.0.0/0',
      interface: 'tun0',
      route: 'default-v4',
      tunnel: 'tun-a',
      securityProfile: 'strict',
      state: 'protected',
      family: 'ipv4',
    },
    {
      destination: '::/0',
      interface: 'tun0',
      route: 'default-v6',
      tunnel: 'tun-a',
      securityProfile: 'strict',
      state: 'protected',
      family: 'ipv6',
    },
  ],
  defaultRoute: {
    destination: '0.0.0.0/0',
    interface: 'tun0',
    route: 'default-v4',
    tunnel: 'tun-a',
    securityProfile: 'strict',
    state: 'protected',
    family: 'ipv4',
  },
  dnsResolvers: ['resolver-a'],
  dnsTransport: 'doh',
  dnsInterface: 'tun0',
  dnsThroughTunnel: true,
  tunnelId: 'tun-a',
  tunnelState: 'connected',
  ipv4Enabled: true,
  ipv6Enabled: true,
  killSwitchState: 'enabled',
  timestamp: '2026-08-13T00:00:00.000Z',
  ...extra,
});
const strictPolicy = createTrafficProtectionPolicy({
  version: 'p18',
  securityProfile: 'strict',
  allowedTunnel: 'tun-a',
  allowedInterfaces: ['tun0'],
  allowedRoutes: ['default-v4', 'default-v6'],
  allowedResolvers: ['resolver-a'],
});

describe('Phase 18 network security protection', () => {
  it('derives expected state from a Phase 11-style policy snapshot', () => {
    const expected = createExpectedNetworkState(strictPolicy);
    expect(expected.requiredTunnel).toBe('tun-a');
    expect(expected.failClosed).toBe(true);
    expect(expected.requiredTransport).toContain('doh');
  });

  it('validates a healthy protected tunnel without false violations', async () => {
    const engine = new NetworkSecurityProtectionEngine();
    const result = await engine.validateProtection({ policy: strictPolicy, observed: observed() });
    expect(result.protected).toBe(true);
    expect(result.state).toBe('protected');
    expect(result.violations).toEqual([]);
  });

  it('detects route leaks through unauthorized physical interfaces', () => {
    const expected = createExpectedNetworkState(strictPolicy);
    const leaks = detectRouteLeaks(
      expected,
      observed({
        activeRoutes: [
          {
            destination: '0.0.0.0/0',
            interface: 'eth0',
            route: 'default-v4',
            securityProfile: 'strict',
            state: 'unprotected',
            family: 'ipv4',
          },
        ],
      }),
    );
    expect(leaks[0]?.detected).toBe(true);
    expect(leaks[0]?.severity).toBe('high');
  });

  it('classifies DNS leaks without claiming confirmed leaks from weak evidence', () => {
    const expected = createExpectedNetworkState(strictPolicy);
    expect(
      classifyDnsLeak(expected, observed({ dnsResolvers: ['resolver-a'], dnsTransport: 'doh' })),
    ).toBe('noLeak');
    expect(
      classifyDnsLeak(
        expected,
        observed({ dnsResolvers: ['resolver-a'], dnsTransport: 'udp', dnsThroughTunnel: true }),
      ),
    ).toBe('confirmedLeak');
  });

  it('treats IPv6 bypass as a critical leak in strict mode', async () => {
    const engine = new NetworkSecurityProtectionEngine();
    const result = await engine.validateProtection({
      policy: strictPolicy,
      observed: observed({
        activeRoutes: [
          {
            destination: '::/0',
            interface: 'eth0',
            route: 'default-v6',
            securityProfile: 'strict',
            state: 'unprotected',
            family: 'ipv6',
          },
        ],
      }),
    });
    expect(result.state).toBe('blocked');
    expect(
      result.violations.some((v) => v.type === 'Ipv6PolicyViolation' && v.severity === 'critical'),
    ).toBe(true);
  });

  it('fails closed and reports kill-switch failure when required tunnel disconnects', async () => {
    const killSwitch: Phase18KillSwitch = {
      prepare: async () => 'preparing',
      enable: async () => 'failed',
      disable: async () => 'disabled',
      status: async () => 'failed',
      validate: async () => false,
    };
    const engine = new NetworkSecurityProtectionEngine(undefined, undefined, killSwitch);
    const result = await engine.validateProtection({
      policy: strictPolicy,
      observed: observed({ tunnelState: 'disconnected', killSwitchState: 'failed' }),
    });
    expect(result.state).toBe('failed');
    expect(result.protected).toBe(false);
  });

  it('keeps fail-open explicit and never labels violations protected', async () => {
    const { allowedTunnel: _allowedTunnel, ...basePolicy } = strictPolicy;
    const policy = createTrafficProtectionPolicy({
      ...basePolicy,
      version: 'compat',
      securityProfile: 'compatibility',
      failClosed: false,
      killSwitchRequired: false,
      allowDirectTraffic: true,
      requireTunnel: false,
    });
    const engine = new NetworkSecurityProtectionEngine();
    const result = await engine.validateProtection({
      policy,
      observed: observed({ dnsResolvers: ['rogue'], dnsTransport: 'udp', dnsThroughTunnel: false }),
    });
    expect(result.protected).toBe(false);
    expect(result.state).toBe('leakDetected');
  });

  it('supports dry-run simulation and bounded remediation without mutation', () => {
    const engine = new NetworkSecurityProtectionEngine();
    const decision = engine.simulateProtection({
      policy: strictPolicy,
      observed: observed({ tunnelState: 'failed' }),
    });
    expect(decision.action).toBe('blockTraffic');
    expect(
      engine
        .simulateRemediation({
          policy: strictPolicy,
          observed: observed({ tunnelState: 'failed' }),
        })
        .every((r) => r.dryRun),
    ).toBe(true);
  });
});
