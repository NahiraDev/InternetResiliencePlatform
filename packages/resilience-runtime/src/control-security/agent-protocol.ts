/**
 * Phase 111 — Secure Agent ↔ Control Plane Protocol.
 *
 * Authenticated message envelopes: HMAC-SHA256 over a canonical header and
 * body hash with a per-session key derived by HKDF, a bounded clock-skew window,
 * strictly increasing sequence numbers and a bounded nonce cache. Message types
 * are allow-listed per direction, and no message type can carry a privileged
 * network mutation: agents submit evidence and requests, never commands.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

export const AGENT_MESSAGE_TYPES = ['hello', 'heartbeat', 'observation-batch', 'config-request', 'ack', 'config-push', 'policy-push', 'command-request'] as const;
export type AgentMessageType = (typeof AGENT_MESSAGE_TYPES)[number];
export type MessageDirection = 'agent-to-control' | 'control-to-agent';

const ALLOWED: Readonly<Record<MessageDirection, readonly AgentMessageType[]>> = Object.freeze({
  'agent-to-control': ['hello', 'heartbeat', 'observation-batch', 'config-request', 'ack', 'command-request'],
  'control-to-agent': ['ack', 'config-push', 'policy-push'],
});

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

export type EnvelopeRejection =
  | 'unsupported-version' | 'type-not-allowed' | 'body-too-large' | 'clock-skew' | 'bad-mac' | 'replayed-nonce' | 'sequence-regression' | 'unknown-session';

export interface EnvelopeVerdict { readonly accepted: boolean; readonly reason?: EnvelopeRejection }

export const deriveSessionKey = (deviceSecret: Buffer | string, sessionId: string, direction: MessageDirection): Buffer =>
  Buffer.from(hkdfSync('sha256', Buffer.from(deviceSecret), Buffer.from(sessionId), Buffer.from(`irp-agent-v1|${direction}`), 32));

const macOf = (key: Buffer, e: Omit<AgentEnvelope, 'mac'>): string => {
  const bodyHash = createHash('sha256').update(e.body).digest('hex');
  const canonical = [e.version, e.sessionId, e.deviceId, e.direction, e.type, e.sequence, e.nonce, e.sentAtMs, bodyHash].join('|');
  return createHmac('sha256', key).update(canonical).digest('base64url');
};

export const sealEnvelope = (key: Buffer, fields: Omit<AgentEnvelope, 'mac' | 'version'>): AgentEnvelope => {
  if (!ALLOWED[fields.direction].includes(fields.type)) throw new Error(`message type ${fields.type} is not allowed ${fields.direction}`);
  const unsigned = { version: 1 as const, ...fields };
  return Object.freeze({ ...unsigned, mac: macOf(key, unsigned) });
};

export interface AgentSessionOptions { readonly maxSkewMs?: number; readonly maxBodyBytes?: number; readonly nonceCacheSize?: number }

/** Receiver-side state for one session and direction. */
export class AgentSessionVerifier {
  private lastSequence = -1;
  private readonly nonces: string[] = [];
  private readonly nonceSet = new Set<string>();
  private readonly maxSkewMs: number; private readonly maxBodyBytes: number; private readonly nonceCacheSize: number;

  constructor(private readonly sessionId: string, private readonly direction: MessageDirection, private readonly key: Buffer, options: AgentSessionOptions = {}) {
    this.maxSkewMs = options.maxSkewMs ?? 30_000;
    this.maxBodyBytes = options.maxBodyBytes ?? 262_144;
    this.nonceCacheSize = options.nonceCacheSize ?? 4_096;
  }

  verify(envelope: AgentEnvelope, nowMs: number): EnvelopeVerdict {
    const reject = (reason: EnvelopeRejection): EnvelopeVerdict => Object.freeze({ accepted: false, reason });
    if (envelope.version !== 1) return reject('unsupported-version');
    if (envelope.sessionId !== this.sessionId || envelope.direction !== this.direction) return reject('unknown-session');
    if (!ALLOWED[this.direction].includes(envelope.type)) return reject('type-not-allowed');
    if (Buffer.byteLength(envelope.body) > this.maxBodyBytes) return reject('body-too-large');
    if (Math.abs(nowMs - envelope.sentAtMs) > this.maxSkewMs) return reject('clock-skew');
    const { mac, ...rest } = envelope;
    const expected = Buffer.from(macOf(this.key, rest)); const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return reject('bad-mac');
    if (this.nonceSet.has(envelope.nonce)) return reject('replayed-nonce');
    if (envelope.sequence <= this.lastSequence) return reject('sequence-regression');
    this.lastSequence = envelope.sequence;
    this.nonces.push(envelope.nonce); this.nonceSet.add(envelope.nonce);
    while (this.nonces.length > this.nonceCacheSize) this.nonceSet.delete(this.nonces.shift() as string);
    return Object.freeze({ accepted: true });
  }
}

/** Agent command requests are requests only; this helper states that contract in one place for callers and tests. */
export const isPrivilegedMutationMessage = (_type: AgentMessageType): false => false;
