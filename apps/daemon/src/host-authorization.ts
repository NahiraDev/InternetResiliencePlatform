/**
 * Host-owned authorization for the daemon's runtime.
 *
 * Trust is not a flag. It is the intersection of three independent facts, all established by the
 * daemon process itself, never by a caller:
 *
 *   1. The operator asked for it: `IRP_RUNTIME_MODE=live` AND `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`.
 *   2. The host permits it: this process really holds CAP_NET_ADMIN (from /proc/self/status CapEff),
 *      the `ip` binary exists, and — for DNS — the process is root with `resolvectl` present.
 *   3. The platform supports it: Linux only.
 *
 * Anything missing fails closed: the runtime is granted observe-only trust and the missing
 * requirement is reported as a blocker, so an operator can see exactly why live mode is not active.
 */
import { accessSync, constants, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActionIntent, HostTrust } from '@irp/resilience-runtime';
import type { DaemonModeResolution } from './daemon-config.js';

/** Linux capability bit numbers (include/uapi/linux/capability.h). */
export const CAP_NET_ADMIN = 12n;

export interface HostFacts {
  readonly platform: NodeJS.Platform;
  readonly euid: number | undefined;
  /** Effective capability bitmask of this process; undefined when it cannot be read. */
  readonly effectiveCapabilities: bigint | undefined;
  readonly hasIp: boolean;
  readonly hasResolvectl: boolean;
}

export interface HostAuthorization {
  readonly requestedMode: DaemonModeResolution['mode'];
  /** What the runtime actually runs as. Live requests that the host cannot honour fall back to safe. */
  readonly effectiveMode: DaemonModeResolution['mode'];
  readonly liveActive: boolean;
  readonly trust: HostTrust;
  /** Why live (or individual live capabilities) are not authorized. Empty when nothing is blocked. */
  readonly blockers: readonly string[];
  readonly evidence: {
    readonly platform: string;
    readonly euid: number | null;
    readonly capNetAdmin: boolean | null;
    readonly ipBinary: boolean;
    readonly resolvectl: boolean;
  };
}

export const readEffectiveCapabilities = (statusText: string): bigint | undefined => {
  const match = /^CapEff:\s*([0-9a-fA-F]+)\s*$/m.exec(statusText);
  return match?.[1] ? BigInt(`0x${match[1]}`) : undefined;
};

/** True when an executable called `name` is on PATH. Looks only; never runs anything. */
export const onPath = (name: string, pathVariable: string = process.env.PATH ?? ''): boolean =>
  pathVariable
    .split(':')
    .filter(Boolean)
    .some((dir) => {
      try {
        accessSync(join(dir, name), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });

export const probeHostFacts = (): HostFacts => {
  let effectiveCapabilities: bigint | undefined;
  if (process.platform === 'linux') {
    try {
      effectiveCapabilities = readEffectiveCapabilities(readFileSync('/proc/self/status', 'utf8'));
    } catch {
      effectiveCapabilities = undefined;
    }
  }
  return {
    platform: process.platform,
    euid: typeof process.geteuid === 'function' ? process.geteuid() : undefined,
    effectiveCapabilities,
    hasIp: process.platform === 'linux' && onPath('ip'),
    hasResolvectl: process.platform === 'linux' && onPath('resolvectl'),
  };
};

const SAFE_ACTIONS: readonly ActionIntent[] = ['health_reprobe', 'noop', 'degraded_mode', 'recovery', 'rollback'];

export const authorizeHost = (request: DaemonModeResolution, facts: HostFacts): HostAuthorization => {
  const blockers: string[] = [];
  const capNetAdmin =
    facts.effectiveCapabilities === undefined ? null : (facts.effectiveCapabilities & (1n << CAP_NET_ADMIN)) !== 0n;
  const evidence = {
    platform: facts.platform,
    euid: facts.euid ?? null,
    capNetAdmin,
    ipBinary: facts.hasIp,
    resolvectl: facts.hasResolvectl,
  };

  const capabilities = ['network.observe'];
  const actions: ActionIntent[] = [...SAFE_ACTIONS];

  if (request.mode === 'live') {
    if (facts.platform !== 'linux') blockers.push(`live mutation is only implemented for Linux, not ${facts.platform}`);
    if (capNetAdmin === null) blockers.push('cannot read /proc/self/status, so CAP_NET_ADMIN cannot be confirmed');
    else if (!capNetAdmin) blockers.push('process lacks CAP_NET_ADMIN (route changes would be refused by the kernel)');
    if (!facts.hasIp) blockers.push('the `ip` (iproute2) binary is not available');

    const routingAllowed = facts.platform === 'linux' && capNetAdmin === true && facts.hasIp;
    if (routingAllowed) {
      capabilities.push('route.write', 'connectivity.failover');
      actions.push('route_change', 'connectivity_failover');
    }

    // DNS changes go through systemd-resolved over D-Bus, which authorizes by identity (polkit),
    // not by capability: only root is assumed to be permitted.
    if (routingAllowed && facts.hasResolvectl && facts.euid === 0) {
      capabilities.push('dns.write');
      actions.push('dns_switch');
    } else if (routingAllowed) {
      blockers.push(
        facts.hasResolvectl
          ? 'dns.write not granted: DNS switching needs root to change systemd-resolved settings'
          : 'dns.write not granted: `resolvectl` (systemd-resolved) is not available',
      );
    }
  }

  const liveActive = request.mode === 'live' && capabilities.includes('route.write');
  const effectiveMode: DaemonModeResolution['mode'] = request.mode === 'live' && !liveActive ? 'safe' : request.mode;
  return {
    requestedMode: request.mode,
    effectiveMode,
    liveActive,
    trust: { principal: 'irp-daemon', capabilities, allowedActions: actions },
    blockers,
    evidence,
  };
};

export interface AdapterAuthorization {
  readonly adapterId: string;
  readonly subsystem: string;
  /** What the adapter's own descriptor claims. A claim, not evidence. */
  readonly declaresLive: boolean;
  /** What this daemon will actually let it do right now. */
  readonly effective: 'live-authorized' | 'host-blocked' | 'safe-only';
  readonly missingHostCapabilities: readonly string[];
}

const isPrivileged = (capability: string): boolean =>
  capability !== 'network.observe' && !capability.endsWith('.read');

/**
 * An adapter declaring `supportsLive` is not operational by itself: live is only effective when the
 * daemon's host authorization is live-active and covers every privileged capability it needs.
 */
export const classifyAdapters = (
  adapters: readonly { adapterId: string; subsystem: string; capabilities: readonly string[]; supportsLive: boolean }[],
  authorization: HostAuthorization,
): readonly AdapterAuthorization[] =>
  adapters.map((adapter) => {
    const granted = new Set(authorization.trust.capabilities);
    const missing = adapter.capabilities.filter((c) => isPrivileged(c) && !granted.has(c));
    const effective: AdapterAuthorization['effective'] = !adapter.supportsLive
      ? 'safe-only'
      : authorization.liveActive && missing.length === 0
        ? 'live-authorized'
        : 'host-blocked';
    return {
      adapterId: adapter.adapterId,
      subsystem: adapter.subsystem,
      declaresLive: adapter.supportsLive,
      effective,
      missingHostCapabilities: adapter.supportsLive ? missing : [],
    };
  });
