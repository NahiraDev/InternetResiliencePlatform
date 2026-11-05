/**
 * Phase 139 — External Integrations, Webhooks & SDK Contracts.
 *
 * Outbound webhooks are signed (HMAC-SHA256 over `timestamp.body`) and
 * delivered with bounded exponential backoff through an injected sender;
 * inbound webhooks are verified with timestamp tolerance and replay
 * protection. `buildSdkContract` derives a stable machine-readable contract
 * from the live API route table so SDKs cannot drift from the server.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
export const signWebhook = (secret, timestampSec, body) => `t=${timestampSec},v1=${createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex')}`;
export class WebhookVerifier {
    secret;
    toleranceSec;
    capacity;
    seen = new Map();
    constructor(secret, toleranceSec = 300, capacity = 10_000) {
        this.secret = secret;
        this.toleranceSec = toleranceSec;
        this.capacity = capacity;
    }
    verify(header, body, nowSec) {
        const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
        if (!m)
            return { ok: false, reason: 'malformed' };
        const ts = Number(m[1]);
        const sig = m[2];
        if (Math.abs(nowSec - ts) > this.toleranceSec)
            return { ok: false, reason: 'stale' };
        const expected = Buffer.from(createHmac('sha256', this.secret).update(`${ts}.${body}`).digest('hex'), 'hex');
        if (!timingSafeEqual(expected, Buffer.from(sig, 'hex')))
            return { ok: false, reason: 'bad-signature' };
        for (const [k, t] of this.seen)
            if (nowSec - t > this.toleranceSec)
                this.seen.delete(k);
        if (this.seen.has(sig))
            return { ok: false, reason: 'replayed' };
        this.seen.set(sig, ts);
        while (this.seen.size > this.capacity)
            this.seen.delete(this.seen.keys().next().value);
        return { ok: true };
    }
}
const retryable = (status) => status === 408 || status === 429 || status >= 500;
export const deliverWebhook = async (target, body, sender, o) => {
    if (!/^https:\/\//.test(target.url))
        return { targetId: target.id, delivered: false, attempts: 0, error: 'https-required' };
    const max = o.maxAttempts ?? 5;
    let lastStatus;
    let error;
    for (let attempt = 1; attempt <= max; attempt += 1) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 10_000);
        try {
            const res = await sender.post(target.url, { 'content-type': 'application/json', 'x-irp-signature': signWebhook(target.secret, o.nowSec(), body) }, body, ctl.signal);
            lastStatus = res.status;
            error = undefined;
            if (res.status >= 200 && res.status < 300)
                return { targetId: target.id, delivered: true, attempts: attempt, lastStatus };
            if (!retryable(res.status))
                return { targetId: target.id, delivered: false, attempts: attempt, lastStatus, error: 'non-retryable-status' };
        }
        catch (e) {
            error = e instanceof Error ? e.message : 'send-failed';
        }
        finally {
            clearTimeout(timer);
        }
        if (attempt < max)
            await o.sleep(Math.min(o.maxDelayMs ?? 30_000, (o.baseDelayMs ?? 500) * 2 ** (attempt - 1)));
    }
    return { targetId: target.id, delivered: false, attempts: max, ...(lastStatus !== undefined ? { lastStatus } : {}), error: error ?? 'retries-exhausted' };
};
export const buildSdkContract = (api) => {
    const operations = api.describe().map((r) => ({ operationId: `${r.method.toLowerCase()}${r.path.split('/').filter(Boolean).map((s) => (s.startsWith(':') ? `By${s.slice(1)[0]?.toUpperCase()}${s.slice(2)}` : `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`)).join('')}@${r.since}`, method: r.method, path: r.path, since: r.since, ...(r.until ? { until: r.until } : {}), capability: r.capability, mutating: r.mutating }));
    const digest = createHmac('sha256', 'irp-sdk-contract').update(JSON.stringify(operations)).digest('hex');
    return Object.freeze({ contractVersion: 1, operations: Object.freeze(operations), digest });
};
//# sourceMappingURL=integrations.js.map