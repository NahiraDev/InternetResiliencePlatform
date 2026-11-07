/**
 * Phase 139 — External Integrations, Webhooks & SDK Contracts.
 *
 * Outbound webhooks are signed (HMAC-SHA256 over `timestamp.body`) and
 * delivered with bounded exponential backoff through an injected sender;
 * inbound webhooks are verified with timestamp tolerance and replay
 * protection. `buildSdkContract` derives a stable machine-readable contract
 * from the live API route table so SDKs cannot drift from the server.
 */
import type { ControlApi } from './versioned-api.js';
export declare const signWebhook: (secret: Buffer | string, timestampSec: number, body: string) => string;
export type WebhookVerification = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly reason: 'malformed' | 'stale' | 'bad-signature' | 'replayed';
};
export declare class WebhookVerifier {
    private readonly secret;
    private readonly toleranceSec;
    private readonly capacity;
    private readonly seen;
    constructor(secret: Buffer | string, toleranceSec?: number, capacity?: number);
    verify(header: string, body: string, nowSec: number): WebhookVerification;
}
export interface WebhookTarget {
    readonly id: string;
    readonly url: string;
    readonly secret: Buffer | string;
}
export interface WebhookSender {
    post(url: string, headers: Readonly<Record<string, string>>, body: string, signal: AbortSignal): Promise<{
        readonly status: number;
    }>;
}
export interface DeliveryOutcome {
    readonly targetId: string;
    readonly delivered: boolean;
    readonly attempts: number;
    readonly lastStatus?: number;
    readonly error?: string;
}
export interface DeliveryOptions {
    readonly maxAttempts?: number;
    readonly baseDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly timeoutMs?: number;
    readonly nowSec: () => number;
    readonly sleep: (ms: number) => Promise<void>;
}
export declare const deliverWebhook: (target: WebhookTarget, body: string, sender: WebhookSender, o: DeliveryOptions) => Promise<DeliveryOutcome>;
export interface SdkContract {
    readonly contractVersion: 1;
    readonly operations: readonly {
        readonly operationId: string;
        readonly method: string;
        readonly path: string;
        readonly since: string;
        readonly until?: string;
        readonly capability: string;
        readonly mutating: boolean;
    }[];
    readonly digest: string;
}
export declare const buildSdkContract: (api: ControlApi) => SdkContract;
//# sourceMappingURL=integrations.d.ts.map