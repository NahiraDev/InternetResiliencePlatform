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
export const AGENT_MESSAGE_TYPES = ['hello', 'heartbeat', 'observation-batch', 'config-request', 'ack', 'config-push', 'policy-push', 'command-request'];
const ALLOWED = Object.freeze({
    'agent-to-control': ['hello', 'heartbeat', 'observation-batch', 'config-request', 'ack', 'command-request'],
    'control-to-agent': ['ack', 'config-push', 'policy-push'],
});
export const deriveSessionKey = (deviceSecret, sessionId, direction) => Buffer.from(hkdfSync('sha256', Buffer.from(deviceSecret), Buffer.from(sessionId), Buffer.from(`irp-agent-v1|${direction}`), 32));
const macOf = (key, e) => {
    const bodyHash = createHash('sha256').update(e.body).digest('hex');
    const canonical = [e.version, e.sessionId, e.deviceId, e.direction, e.type, e.sequence, e.nonce, e.sentAtMs, bodyHash].join('|');
    return createHmac('sha256', key).update(canonical).digest('base64url');
};
export const sealEnvelope = (key, fields) => {
    if (!ALLOWED[fields.direction].includes(fields.type))
        throw new Error(`message type ${fields.type} is not allowed ${fields.direction}`);
    const unsigned = { version: 1, ...fields };
    return Object.freeze({ ...unsigned, mac: macOf(key, unsigned) });
};
/** Receiver-side state for one session and direction. */
export class AgentSessionVerifier {
    sessionId;
    direction;
    key;
    lastSequence = -1;
    nonces = [];
    nonceSet = new Set();
    maxSkewMs;
    maxBodyBytes;
    nonceCacheSize;
    constructor(sessionId, direction, key, options = {}) {
        this.sessionId = sessionId;
        this.direction = direction;
        this.key = key;
        this.maxSkewMs = options.maxSkewMs ?? 30_000;
        this.maxBodyBytes = options.maxBodyBytes ?? 262_144;
        this.nonceCacheSize = options.nonceCacheSize ?? 4_096;
    }
    verify(envelope, nowMs) {
        const reject = (reason) => Object.freeze({ accepted: false, reason });
        if (envelope.version !== 1)
            return reject('unsupported-version');
        if (envelope.sessionId !== this.sessionId || envelope.direction !== this.direction)
            return reject('unknown-session');
        if (!ALLOWED[this.direction].includes(envelope.type))
            return reject('type-not-allowed');
        if (Buffer.byteLength(envelope.body) > this.maxBodyBytes)
            return reject('body-too-large');
        if (Math.abs(nowMs - envelope.sentAtMs) > this.maxSkewMs)
            return reject('clock-skew');
        const { mac, ...rest } = envelope;
        const expected = Buffer.from(macOf(this.key, rest));
        const given = Buffer.from(mac);
        if (expected.length !== given.length || !timingSafeEqual(expected, given))
            return reject('bad-mac');
        if (this.nonceSet.has(envelope.nonce))
            return reject('replayed-nonce');
        if (envelope.sequence <= this.lastSequence)
            return reject('sequence-regression');
        this.lastSequence = envelope.sequence;
        this.nonces.push(envelope.nonce);
        this.nonceSet.add(envelope.nonce);
        while (this.nonces.length > this.nonceCacheSize)
            this.nonceSet.delete(this.nonces.shift());
        return Object.freeze({ accepted: true });
    }
}
/** Agent command requests are requests only; this helper states that contract in one place for callers and tests. */
export const isPrivilegedMutationMessage = (_type) => false;
//# sourceMappingURL=agent-protocol.js.map