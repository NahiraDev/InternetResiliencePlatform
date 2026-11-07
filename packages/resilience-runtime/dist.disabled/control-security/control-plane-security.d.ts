/**
 * Phase 107 — Secure Control-Plane Architecture.
 *
 * A declarative channel-security contract and a pure assessor. Every control
 * channel (API, agent, federation, plugin) declares its transport properties;
 * the assessor returns findings and a fail-closed verdict. Remote and plugin
 * channels can never be assessed as privileged-capable, preserving the single
 * mutation authority.
 */
import { type TrustBoundary } from '../security/trust-boundaries.js';
export declare const CONTROL_CHANNEL_KINDS: readonly ["api", "agent", "federation", "plugin", "internal"];
export type ControlChannelKind = (typeof CONTROL_CHANNEL_KINDS)[number];
export type TlsVersion = 'none' | 'TLS1.0' | 'TLS1.1' | 'TLS1.2' | 'TLS1.3';
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
export declare const DEFAULT_CHANNEL_REQUIREMENTS: Readonly<Record<ControlChannelKind, ChannelSecurityRequirements>>;
export type FindingSeverity = 'info' | 'warning' | 'critical';
export interface ChannelFinding {
    readonly channelId: string;
    readonly code: string;
    readonly severity: FindingSeverity;
    readonly message: string;
}
export interface ChannelAssessment {
    readonly channelId: string;
    readonly compliant: boolean;
    readonly findings: readonly ChannelFinding[];
}
export interface ControlPlanePosture {
    readonly secure: boolean;
    readonly assessments: readonly ChannelAssessment[];
    readonly criticalCount: number;
    readonly reasons: readonly string[];
}
export declare const assessControlChannel: (channel: ControlChannelDescriptor, requirements?: Readonly<Record<ControlChannelKind, ChannelSecurityRequirements>>) => ChannelAssessment;
/** Fail-closed posture: any critical finding or empty channel set makes the plane insecure. */
export declare const assessControlPlane: (channels: readonly ControlChannelDescriptor[]) => ControlPlanePosture;
//# sourceMappingURL=control-plane-security.d.ts.map