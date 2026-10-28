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
import type { ControlApi } from './versioned-api.js';

export const signWebhook = (secret: Buffer | string, timestampSec: number, body: string): string =>
  `t=${timestampSec},v1=${createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex')}`;

export type WebhookVerification = { readonly ok: true } | { readonly ok: false; readonly reason: 'malformed' | 'stale' | 'bad-signature' | 'replayed' };

export class WebhookVerifier {
  private readonly seen = new Map<string, number>();
  constructor(private readonly secret: Buffer | string, private readonly toleranceSec = 300, private readonly capacity = 10_000) {}

  verify(header: string, body: string, nowSec: number): WebhookVerification {
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
    if (!m) return { ok: false, reason: 'malformed' };
    const ts = Number(m[1]); const sig = m[2] as string;
    if (Math.abs(nowSec - ts) > this.toleranceSec) return { ok: false, reason: 'stale' };
    const expected = Buffer.from(createHmac('sha256', this.secret).update(`${ts}.${body}`).digest('hex'), 'hex');
    if (!timingSafeEqual(expected, Buffer.from(sig, 'hex'))) return { ok: false, reason: 'bad-signature' };
    for (const [k, t] of this.seen) if (nowSec - t > this.toleranceSec) this.seen.delete(k);
    if (this.seen.has(sig)) return { ok: false, reason: 'replayed' };
    this.seen.set(sig, ts);
    while (this.seen.size > this.capacity) this.seen.delete(this.seen.keys().next().value as string);
    return { ok: true };
  }
}

export interface WebhookTarget { readonly id: string; readonly url: string; readonly secret: Buffer | string }
export interface WebhookSender { post(url: string, headers: Readonly<Record<string, string>>, body: string, signal: AbortSignal): Promise<{ readonly status: number }> }
export interface DeliveryOutcome { readonly targetId: string; readonly delivered: boolean; readonly attempts: number; readonly lastStatus?: number; readonly error?: string }
export interface DeliveryOptions { readonly maxAttempts?: number; readonly baseDelayMs?: number; readonly maxDelayMs?: number; readonly timeoutMs?: number; readonly nowSec: () => number; readonly sleep: (ms: number) => Promise<void> }

const retryable = (status: number) => status === 408 || status === 429 || status >= 500;

export const deliverWebhook = async (target: WebhookTarget, body: string, sender: WebhookSender, o: DeliveryOptions): Promise<DeliveryOutcome> => {
  if (!/^https:\/\//.test(target.url)) return { targetId: target.id, delivered: false, attempts: 0, error: 'https-required' };
  const max = o.maxAttempts ?? 5; let lastStatus: number | undefined; let error: string | undefined;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 10_000);
    try {
      const res = await sender.post(target.url, { 'content-type': 'application/json', 'x-irp-signature': signWebhook(target.secret, o.nowSec(), body) }, body, ctl.signal);
      lastStatus = res.status; error = undefined;
      if (res.status >= 200 && res.status < 300) return { targetId: target.id, delivered: true, attempts: attempt, lastStatus };
      if (!retryable(res.status)) return { targetId: target.id, delivered: false, attempts: attempt, lastStatus, error: 'non-retryable-status' };
    } catch (e) { error = e instanceof Error ? e.message : 'send-failed'; } finally { clearTimeout(timer); }
    if (attempt < max) await o.sleep(Math.min(o.maxDelayMs ?? 30_000, (o.baseDelayMs ?? 500) * 2 ** (attempt - 1)));
  }
  return { targetId: target.id, delivered: false, attempts: max, ...(lastStatus !== undefined ? { lastStatus } : {}), error: error ?? 'retries-exhausted' };
};

export interface SdkContract { readonly contractVersion: 1; readonly operations: readonly { readonly operationId: string; readonly method: string; readonly path: string; readonly since: string; readonly until?: string; readonly capability: string; readonly mutating: boolean }[]; readonly digest: string }

export const buildSdkContract = (api: ControlApi): SdkContract => {
  const operations = api.describe().map((r) => ({ operationId: `${r.method.toLowerCase()}${r.path.split('/').filter(Boolean).map((s) => (s.startsWith(':') ? `By${s.slice(1)[0]?.toUpperCase()}${s.slice(2)}` : `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`)).join('')}@${r.since}`, method: r.method, path: r.path, since: r.since, ...(r.until ? { until: r.until } : {}), capability: r.capability, mutating: r.mutating }));
  const digest = createHmac('sha256', 'irp-sdk-contract').update(JSON.stringify(operations)).digest('hex');
  return Object.freeze({ contractVersion: 1 as const, operations: Object.freeze(operations), digest });
};
