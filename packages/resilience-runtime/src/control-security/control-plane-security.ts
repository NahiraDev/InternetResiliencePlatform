/**
 * Phase 107 — Secure Control-Plane Architecture.
 *
 * A declarative channel-security contract and a pure assessor. Every control
 * channel (API, agent, federation, plugin) declares its transport properties;
 * the assessor returns findings and a fail-closed verdict. Remote and plugin
 * channels can never be assessed as privileged-capable, preserving the single
 * mutation authority.
 */

import { TRUST_RANK, type TrustBoundary } from '../security/trust-boundaries.js';

export const CONTROL_CHANNEL_KINDS = ['api', 'agent', 'federation', 'plugin', 'internal'] as const;
export type ControlChannelKind = (typeof CONTROL_CHANNEL_KINDS)[number];

export type TlsVersion = 'none' | 'TLS1.0' | 'TLS1.1' | 'TLS1.2' | 'TLS1.3';
const TLS_RANK: Readonly<Record<TlsVersion, number>> = { none: 0, 'TLS1.0': 1, 'TLS1.1': 2, 'TLS1.2': 3, 'TLS1.3': 4 };

export interface ControlChannelDescriptor {
  readonly id: string;
  readonly kind: ControlChannelKind;
  readonly boundary: TrustBoundary;
  readonly tls: TlsVersion;
  readonly mutualAuth: boolean;
  readonly messageSigning: boolean;
  readonly replayProtection: boolean;
  readonly authenticatedPrincipal: boolean;
  readonly maxMessageBytes: number;
  readonly requestsPrivilegedMutation: boolean;
}

export interface ChannelSecurityRequirements {
  readonly minimumTls: TlsVersion;
  readonly requireMutualAuth: boolean;
  readonly requireMessageSigning: boolean;
  readonly requireReplayProtection: boolean;
  readonly maxMessageBytesCeiling: number;
}

export const DEFAULT_CHANNEL_REQUIREMENTS: Readonly<Record<ControlChannelKind, ChannelSecurityRequirements>> = Object.freeze({
  api: { minimumTls: 'TLS1.2', requireMutualAuth: false, requireMessageSigning: false, requireReplayProtection: true, maxMessageBytesCeiling: 1_048_576 },
  agent: { minimumTls: 'TLS1.3', requireMutualAuth: true, requireMessageSigning: true, requireReplayProtection: true, maxMessageBytesCeiling: 262_144 },
  federation: { minimumTls: 'TLS1.3', requireMutualAuth: true, requireMessageSigning: true, requireReplayProtection: true, maxMessageBytesCeiling: 262_144 },
  plugin: { minimumTls: 'TLS1.2', requireMutualAuth: false, requireMessageSigning: true, requireReplayProtection: true, maxMessageBytesCeiling: 131_072 },
  internal: { minimumTls: 'none', requireMutualAuth: false, requireMessageSigning: false, requireReplayProtection: false, maxMessageBytesCeiling: 4_194_304 },
});

export type FindingSeverity = 'info' | 'warning' | 'critical';
export interface ChannelFinding { readonly channelId: string; readonly code: string; readonly severity: FindingSeverity; readonly message: string }
export interface ChannelAssessment { readonly channelId: string; readonly compliant: boolean; readonly findings: readonly ChannelFinding[] }
export interface ControlPlanePosture {
  readonly secure: boolean;
  readonly assessments: readonly ChannelAssessment[];
  readonly criticalCount: number;
  readonly reasons: readonly string[];
}

export const assessControlChannel = (
  channel: ControlChannelDescriptor,
  requirements: Readonly<Record<ControlChannelKind, ChannelSecurityRequirements>> = DEFAULT_CHANNEL_REQUIREMENTS,
): ChannelAssessment => {
  const req = requirements[channel.kind];
  const findings: ChannelFinding[] = [];
  const add = (code: string, severity: FindingSeverity, message: string) => findings.push(Object.freeze({ channelId: channel.id, code, severity, message }));
  if (TLS_RANK[channel.tls] < TLS_RANK[req.minimumTls]) add('tls-too-weak', 'critical', `requires ${req.minimumTls}, found ${channel.tls}`);
  if (req.requireMutualAuth && !channel.mutualAuth) add('mutual-auth-missing', 'critical', 'mutual authentication is required');
  if (req.requireMessageSigning && !channel.messageSigning) add('message-signing-missing', 'critical', 'message signing is required');
  if (req.requireReplayProtection && !channel.replayProtection) add('replay-protection-missing', 'critical', 'replay protection is required');
  if (channel.kind !== 'internal' && !channel.authenticatedPrincipal) add('unauthenticated-principal', 'critical', 'channel must bind an authenticated principal');
  if (channel.maxMessageBytes > req.maxMessageBytesCeiling) add('message-limit-too-high', 'warning', `limit ${channel.maxMessageBytes} exceeds ceiling ${req.maxMessageBytesCeiling}`);
  if (channel.maxMessageBytes <= 0) add('message-limit-missing', 'critical', 'a positive message size limit is required');
  if (channel.requestsPrivilegedMutation && TRUST_RANK[channel.boundary] < TRUST_RANK['platform-adapter']) {
    add('privileged-mutation-from-untrusted-boundary', 'critical', `${channel.boundary} channels cannot request privileged mutation`);
  }
  if (channel.kind === 'internal' && channel.boundary !== 'canonical-runtime' && channel.boundary !== 'platform-adapter') {
    add('internal-channel-boundary', 'critical', 'internal channels must belong to the runtime trust domain');
  }
  return Object.freeze({ channelId: channel.id, compliant: !findings.some((f) => f.severity === 'critical'), findings: Object.freeze(findings) });
};

/** Fail-closed posture: any critical finding or empty channel set makes the plane insecure. */
export const assessControlPlane = (channels: readonly ControlChannelDescriptor[]): ControlPlanePosture => {
  const ids = new Set<string>();
  const dup = channels.filter((c) => (ids.has(c.id) ? true : (ids.add(c.id), false)));
  const assessments = channels.map((c) => assessControlChannel(c)).sort((a, b) => a.channelId.localeCompare(b.channelId));
  const criticalCount = assessments.reduce((n, a) => n + a.findings.filter((f) => f.severity === 'critical').length, 0);
  const reasons: string[] = [];
  if (channels.length === 0) reasons.push('no-control-channels-declared');
  if (dup.length) reasons.push(`duplicate-channel-ids:${dup.map((d) => d.id).join(',')}`);
  if (criticalCount > 0) reasons.push(`critical-findings:${criticalCount}`);
  return Object.freeze({ secure: reasons.length === 0, assessments: Object.freeze(assessments), criticalCount, reasons: Object.freeze(reasons.length ? reasons : ['control-plane-compliant']) });
};
