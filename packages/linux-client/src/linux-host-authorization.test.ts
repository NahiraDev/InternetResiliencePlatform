import { describe, expect, it } from 'vitest';
import {
  authorizeLinuxHost,
  CAP_NET_ADMIN,
  readEffectiveCapabilities,
  type LinuxHostFacts,
} from './linux-host-authorization.js';

const trustedFacts = (): LinuxHostFacts => ({
  platform: 'linux',
  euid: 1000,
  effectiveCapabilities: 1n << CAP_NET_ADMIN,
  hasIp: true,
  hasWireGuard: true,
  credentialsDirectoryAvailable: true,
});

describe('Linux host authorization', () => {
  it('parses the effective capability mask from proc status', () => {
    const mask = 1n << CAP_NET_ADMIN;
    const status = ['Name:\tnode', 'CapEff:\t' + mask.toString(16), ''].join('\n');
    expect(readEffectiveCapabilities(status)).toBe(mask);
    expect(readEffectiveCapabilities('Name:\tnode\n')).toBeUndefined();
  });

  it('remains simulation-only unless explicit live controls were requested', () => {
    const authorization = authorizeLinuxHost(
      { requestedLive: false, wireGuardConfigured: true },
      trustedFacts(),
    );
    expect(authorization.effectiveMode).toBe('simulation');
    expect(authorization.liveActive).toBe(false);
    expect(authorization.tunnelActive).toBe(false);
    expect(authorization.trust.capabilities).toEqual(['network.observe']);
    expect(authorization.trust.allowedActions).not.toContain('tunnel_switch');
  });

  it('grants route authority only after CAP_NET_ADMIN and iproute2 are confirmed', () => {
    const authorization = authorizeLinuxHost(
      { requestedLive: true, wireGuardConfigured: false },
      trustedFacts(),
    );
    expect(authorization.effectiveMode).toBe('real');
    expect(authorization.trust.capabilities).toEqual([
      'network.observe',
      'route.write',
      'connectivity.failover',
    ]);
    expect(authorization.trust.allowedActions).toContain('route_change');
    expect(authorization.trust.allowedActions).not.toContain('tunnel_switch');
  });

  it('grants tunnel reconnect authority only with an enabled provider, wg binary and systemd credentials', () => {
    const authorization = authorizeLinuxHost(
      { requestedLive: true, wireGuardConfigured: true },
      trustedFacts(),
    );
    expect(authorization.tunnelActive).toBe(true);
    expect(authorization.trust.capabilities).toContain('tunnel.write');
    expect(authorization.trust.allowedActions).toContain('tunnel_switch');
  });

  it('does not grant route or tunnel mutation when the process lacks CAP_NET_ADMIN', () => {
    const facts = { ...trustedFacts(), effectiveCapabilities: 0n };
    const authorization = authorizeLinuxHost(
      { requestedLive: true, wireGuardConfigured: true },
      facts,
    );
    expect(authorization.effectiveMode).toBe('simulation');
    expect(authorization.trust.capabilities).toEqual(['network.observe']);
    expect(authorization.tunnelActive).toBe(false);
    expect(authorization.blockers).toContain('process lacks CAP_NET_ADMIN');
  });

  it('keeps route authority while withholding tunnel authority if systemd credentials are absent', () => {
    const facts = { ...trustedFacts(), credentialsDirectoryAvailable: false };
    const authorization = authorizeLinuxHost(
      { requestedLive: true, wireGuardConfigured: true },
      facts,
    );
    expect(authorization.liveActive).toBe(true);
    expect(authorization.tunnelActive).toBe(false);
    expect(authorization.trust.capabilities).toContain('route.write');
    expect(authorization.trust.capabilities).not.toContain('tunnel.write');
    expect(authorization.blockers.join(' ')).toMatch(/CREDENTIALS_DIRECTORY/);
  });

  it('withholds all live capabilities on non-Linux platforms', () => {
    const facts = { ...trustedFacts(), platform: 'darwin' as const };
    const authorization = authorizeLinuxHost(
      { requestedLive: true, wireGuardConfigured: true },
      facts,
    );
    expect(authorization.effectiveMode).toBe('simulation');
    expect(authorization.trust.capabilities).toEqual(['network.observe']);
    expect(authorization.blockers.join(' ')).toMatch(/only supported on Linux/);
  });
});
