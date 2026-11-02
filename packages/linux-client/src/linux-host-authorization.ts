import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ActionIntent, HostTrust } from '@irp/resilience-runtime';

/** Linux capability bit number from include/uapi/linux/capability.h. */
export const CAP_NET_ADMIN = 12n;

export interface LinuxHostFacts {
  readonly platform: NodeJS.Platform;
  readonly euid: number | undefined;
  readonly effectiveCapabilities: bigint | undefined;
  readonly hasIp: boolean;
  readonly hasWireGuard: boolean;
  readonly credentialsDirectoryAvailable: boolean;
}

export interface LinuxHostAuthorizationRequest {
  /** True only when both explicit live-operation environment switches are set. */
  readonly requestedLive: boolean;
  readonly wireGuardConfigured: boolean;
}

export interface LinuxHostAuthorization {
  readonly requestedLive: boolean;
  readonly effectiveMode: 'simulation' | 'real';
  readonly liveActive: boolean;
  readonly tunnelActive: boolean;
  readonly trust: HostTrust;
  readonly blockers: readonly string[];
  readonly evidence: {
    readonly platform: string;
    readonly euid: number | null;
    readonly capNetAdmin: boolean | null;
    readonly ipBinary: boolean;
    readonly wireGuardBinary: boolean;
    readonly credentialsDirectory: boolean;
  };
}

const SAFE_ACTIONS: readonly ActionIntent[] = [
  'health_reprobe',
  'noop',
  'degraded_mode',
  'recovery',
  'rollback',
];

export const readEffectiveCapabilities = (statusText: string): bigint | undefined => {
  const match = /^CapEff:\s*([0-9a-fA-F]+)\s*$/m.exec(statusText);
  return match?.[1] ? BigInt('0x' + match[1]) : undefined;
};

export const isExecutableOnPath = (
  name: string,
  pathVariable: string = process.env.PATH ?? '',
): boolean =>
  pathVariable
    .split(':')
    .filter(Boolean)
    .some((directory) => {
      try {
        accessSync(join(directory, name), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });

export const probeLinuxHostFacts = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): LinuxHostFacts => {
  let effectiveCapabilities: bigint | undefined;
  if (process.platform === 'linux') {
    try {
      effectiveCapabilities = readEffectiveCapabilities(readFileSync('/proc/self/status', 'utf8'));
    } catch {
      effectiveCapabilities = undefined;
    }
  }

  const credentialsDirectory = env.CREDENTIALS_DIRECTORY?.trim();
  let credentialsDirectoryAvailable = false;
  if (credentialsDirectory) {
    try {
      credentialsDirectoryAvailable = statSync(credentialsDirectory).isDirectory();
    } catch {
      credentialsDirectoryAvailable = false;
    }
  }

  return {
    platform: process.platform,
    euid: typeof process.geteuid === 'function' ? process.geteuid() : undefined,
    effectiveCapabilities,
    hasIp: process.platform === 'linux' && isExecutableOnPath('ip'),
    hasWireGuard: process.platform === 'linux' && isExecutableOnPath('wg'),
    credentialsDirectoryAvailable,
  };
};

/**
 * Host-owned authorization for the Linux Full Client. Environment switches are
 * intent, not authority: route and tunnel mutation are granted only after the
 * effective kernel capability and required binaries are independently proven.
 */
export const authorizeLinuxHost = (
  request: LinuxHostAuthorizationRequest,
  facts: LinuxHostFacts,
): LinuxHostAuthorization => {
  const blockers: string[] = [];
  const capNetAdmin =
    facts.effectiveCapabilities === undefined
      ? null
      : (facts.effectiveCapabilities & (1n << CAP_NET_ADMIN)) !== 0n;

  let routeAuthorized = false;
  if (request.requestedLive) {
    if (facts.platform !== 'linux') blockers.push('live network mutation is only supported on Linux, not ' + facts.platform);
    if (capNetAdmin === null) blockers.push('cannot read /proc/self/status, so CAP_NET_ADMIN cannot be confirmed');
    else if (!capNetAdmin) blockers.push('process lacks CAP_NET_ADMIN');
    if (!facts.hasIp) blockers.push('the iproute2 ip binary is not available');
    routeAuthorized = facts.platform === 'linux' && capNetAdmin === true && facts.hasIp;
  }

  const tunnelAuthorized =
    routeAuthorized &&
    request.wireGuardConfigured &&
    facts.hasWireGuard &&
    facts.credentialsDirectoryAvailable;

  if (request.requestedLive && request.wireGuardConfigured && routeAuthorized) {
    if (!facts.hasWireGuard) blockers.push('WireGuard tunnel mutation is disabled because the wg binary is not available');
    if (!facts.credentialsDirectoryAvailable)
      blockers.push('WireGuard tunnel mutation is disabled because systemd CREDENTIALS_DIRECTORY is unavailable');
  }

  const capabilities = ['network.observe'];
  const allowedActions: ActionIntent[] = [...SAFE_ACTIONS];
  if (routeAuthorized) {
    capabilities.push('route.write', 'connectivity.failover');
    allowedActions.push('route_change', 'connectivity_failover');
  }
  if (tunnelAuthorized) {
    capabilities.push('tunnel.write');
    allowedActions.push('tunnel_switch');
  }

  return {
    requestedLive: request.requestedLive,
    effectiveMode: routeAuthorized ? 'real' : 'simulation',
    liveActive: routeAuthorized,
    tunnelActive: tunnelAuthorized,
    trust: {
      principal: 'irp-linux-client',
      capabilities,
      allowedActions,
    },
    blockers,
    evidence: {
      platform: facts.platform,
      euid: facts.euid ?? null,
      capNetAdmin,
      ipBinary: facts.hasIp,
      wireGuardBinary: facts.hasWireGuard,
      credentialsDirectory: facts.credentialsDirectoryAvailable,
    },
  };
};
