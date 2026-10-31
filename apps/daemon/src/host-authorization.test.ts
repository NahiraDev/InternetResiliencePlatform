import { describe, expect, it } from 'vitest';
import { authorizeHost, readEffectiveCapabilities, type HostFacts } from './host-authorization.js';

const facts = (over: Partial<HostFacts> = {}): HostFacts => ({
  platform: 'linux', euid: 0, effectiveCapabilities: 1n << 12n, hasIp: true, hasResolvectl: true, ...over,
});
const live = { mode: 'live', liveRouteMutation: true } as const;
const safe = { mode: 'safe', liveRouteMutation: false } as const;

describe('authorizeHost', () => {
  it('grants observe-only trust in safe mode even on a fully privileged host', () => {
    const a = authorizeHost(safe, facts());
    expect(a.trust.capabilities).toEqual(['network.observe']);
    expect(a.trust.allowedActions).not.toContain('route_change');
    expect(a.liveActive).toBe(false);
  });

  it('grants live route and DNS authority only when the host really permits it', () => {
    const a = authorizeHost(live, facts());
    expect(a.liveActive).toBe(true);
    expect(a.effectiveMode).toBe('live');
    expect(a.trust.capabilities).toEqual(['network.observe', 'route.write', 'connectivity.failover', 'dns.write']);
    expect(a.trust.allowedActions).toEqual(expect.arrayContaining(['route_change', 'connectivity_failover', 'dns_switch']));
    expect(a.blockers).toEqual([]);
  });

  it('falls back to safe and explains why when CAP_NET_ADMIN is missing', () => {
    const a = authorizeHost(live, facts({ effectiveCapabilities: 0n }));
    expect(a.effectiveMode).toBe('safe');
    expect(a.liveActive).toBe(false);
    expect(a.trust.capabilities).toEqual(['network.observe']);
    expect(a.blockers.join(' ')).toMatch(/CAP_NET_ADMIN/);
    expect(a.evidence.capNetAdmin).toBe(false);
  });

  it('fails closed when capabilities cannot be read', () => {
    const a = authorizeHost(live, facts({ effectiveCapabilities: undefined }));
    expect(a.liveActive).toBe(false);
    expect(a.evidence.capNetAdmin).toBeNull();
    expect(a.blockers.join(' ')).toMatch(/cannot be confirmed/);
  });

  it('refuses live on non-Linux platforms', () => {
    const a = authorizeHost(live, facts({ platform: 'darwin' }));
    expect(a.liveActive).toBe(false);
    expect(a.blockers.join(' ')).toMatch(/only implemented for Linux/);
  });

  it('requires iproute2 for route authority', () => {
    const a = authorizeHost(live, facts({ hasIp: false }));
    expect(a.liveActive).toBe(false);
    expect(a.blockers.join(' ')).toMatch(/iproute2/);
  });

  it('grants routing without DNS for a non-root service user holding CAP_NET_ADMIN', () => {
    const a = authorizeHost(live, facts({ euid: 995 }));
    expect(a.liveActive).toBe(true);
    expect(a.trust.capabilities).toContain('route.write');
    expect(a.trust.capabilities).not.toContain('dns.write');
    expect(a.trust.allowedActions).not.toContain('dns_switch');
    expect(a.blockers.join(' ')).toMatch(/dns.write not granted/);
  });

  it('withholds DNS authority without resolvectl', () => {
    const a = authorizeHost(live, facts({ hasResolvectl: false }));
    expect(a.trust.capabilities).not.toContain('dns.write');
    expect(a.blockers.join(' ')).toMatch(/resolvectl/);
  });
});

describe('readEffectiveCapabilities', () => {
  it('parses CapEff from /proc status text', () => {
    const text = 'Name:\tnode\nCapInh:\t0000000000000000\nCapEff:\t0000000000001000\nCapBnd:\t000001ffffffffff\n';
    expect(readEffectiveCapabilities(text)).toBe(0x1000n);
    expect((readEffectiveCapabilities(text)! & (1n << 12n)) !== 0n).toBe(true);
  });
  it('returns undefined when absent', () => {
    expect(readEffectiveCapabilities('Name:\tx\n')).toBeUndefined();
  });
});

describe('onPath', () => {
  it('finds executables on PATH and does not run them', async () => {
    const { onPath } = await import('./host-authorization.js');
    expect(onPath('sh', '/bin:/usr/bin')).toBe(true);
    expect(onPath('definitely-not-a-real-binary-xyz', '/bin:/usr/bin')).toBe(false);
    expect(onPath('sh', '')).toBe(false);
  });
});

describe('classifyAdapters', () => {
  const adapters = [
    { adapterId: 'net', subsystem: 'routing', capabilities: ['network.observe', 'route.write'], supportsLive: true },
    { adapterId: 'dns', subsystem: 'dns', capabilities: ['dns.write'], supportsLive: true },
    { adapterId: 'obs', subsystem: 'kernel', capabilities: ['network.observe'], supportsLive: false },
  ];
  it('does not treat supportsLive as operational when the host has not authorized it', async () => {
    const { classifyAdapters } = await import('./host-authorization.js');
    const result = classifyAdapters(adapters, authorizeHost(safe, facts()));
    expect(result.map((a) => a.effective)).toEqual(['host-blocked', 'host-blocked', 'safe-only']);
    expect(result[0]?.missingHostCapabilities).toEqual(['route.write']);
  });
  it('marks adapters live only when every privileged capability is granted', async () => {
    const { classifyAdapters } = await import('./host-authorization.js');
    const nonRoot = classifyAdapters(adapters, authorizeHost(live, facts({ euid: 995 })));
    expect(nonRoot.map((a) => a.effective)).toEqual(['live-authorized', 'host-blocked', 'safe-only']);
    const root = classifyAdapters(adapters, authorizeHost(live, facts()));
    expect(root.map((a) => a.effective)).toEqual(['live-authorized', 'live-authorized', 'safe-only']);
  });
});
