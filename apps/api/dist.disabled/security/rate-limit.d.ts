import type { FastifyReply, FastifyRequest } from 'fastify';
export type RateLimitPolicy = {
    max: number;
    windowMs: number;
    key?: (request: FastifyRequest) => string;
};
export type RateLimitDecision = {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
};
/**
 * Process-local fallback limiter used until the API is backed by a shared
 * Redis store. The API must not treat this as sufficient for horizontally
 * scaled production deployments; the store boundary is intentionally kept
 * behind this small interface so it can be replaced without changing route
 * policy definitions.
 */
export declare class InMemoryRateLimiter {
    private readonly policy;
    private readonly buckets;
    constructor(policy: RateLimitPolicy);
    check(key: string, now?: number): RateLimitDecision;
    clear(): void;
}
export declare const defaultRateLimitKey: (request: FastifyRequest) => string;
export declare const rateLimitPreHandler: (limiter: InMemoryRateLimiter, key?: (request: FastifyRequest) => string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/** Minimal shape of a shared counter store (see identity RateLimitStore); keeps this module dependency-free. */
export interface SharedRateLimitStore {
    hit(key: string, max: number, windowMs: number): Promise<RateLimitDecision>;
}
/**
 * Store-backed limiter: with the PostgreSQL store the window is shared by every API instance.
 * If the store errors the request is rejected (503) rather than silently allowed: fail closed.
 */
export declare const sharedRateLimitPreHandler: (store: SharedRateLimitStore, policy: {
    name: string;
    max: number;
    windowMs: number;
}, key?: (request: FastifyRequest) => string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=rate-limit.d.ts.map