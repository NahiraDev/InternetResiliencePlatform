/**
 * Phase 111 — Secure Agent ↔ Control Plane Protocol.
 *
 * Authenticated message envelopes: HMAC-SHA256 over a canonical header and
 * body hash with a per-session key derived by HKDF, a bounded clock-skew window,
 * strictly increasing sequence numbers and a bounded nonce cache. Message types
 * are allow-listed per direction, and no message type can carry a privileged
 * network mutation: agents submit evidence and requests, never commands.
 */
export declare const AGENT_MESSAGE_TYPES: readonly ["hello", "heartbeat", "observation-batch", "config-request", "ack", "config-push", "policy-push", "command-request"];
export type AgentMessageType = (typeof AGENT_MESSAGE_TYPES)[number];
export type MessageDirection = 'agent-to-control' | 'control-to-agent';
export interface AgentEnvelope {
    readonly version: 1;
    readonly sessionId: string;
    readonly deviceId: string;
    readonly direction: MessageDirection;
    readonly type: AgentMessageType;
    readonly sequence: number;
    readonly nonce: string;
    readonly sentAtMs: number;
    readonly body: string;
    readonly mac: string;
}
export type EnvelopeRejection = 'unsupported-version' | 'type-not-allowed' | 'body-too-large' | 'clock-skew' | 'bad-mac' | 'replayed-nonce' | 'sequence-regression' | 'unknown-session';
export interface EnvelopeVerdict {
    readonly accepted: boolean;
    readonly reason?: EnvelopeRejection;
}
export declare const deriveSessionKey: (deviceSecret: Buffer | string, sessionId: string, direction: MessageDirection) => Buffer;
export declare const sealEnvelope: (key: Buffer, fields: Omit<AgentEnvelope, "mac" | "version">) => AgentEnvelope;
export interface AgentSessionOptions {
    readonly maxSkewMs?: number;
    readonly maxBodyBytes?: number;
    readonly nonceCacheSize?: number;
}
/** Receiver-side state for one session and direction. */
export declare class AgentSessionVerifier {
    private readonly sessionId;
    private readonly direction;
    private readonly key;
    private lastSequence;
    private readonly nonces;
    private readonly nonceSet;
    private readonly maxSkewMs;
    private readonly maxBodyBytes;
    private readonly nonceCacheSize;
    constructor(sessionId: string, direction: MessageDirection, key: Buffer, options?: AgentSessionOptions);
    verify(envelope: AgentEnvelope, nowMs: number): EnvelopeVerdict;
}
/** Agent command requests are requests only; this helper states that contract in one place for callers and tests. */
export declare const isPrivilegedMutationMessage: (_type: AgentMessageType) => false;
//# sourceMappingURL=agent-protocol.d.ts.map