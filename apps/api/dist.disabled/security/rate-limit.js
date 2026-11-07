/**
 * Process-local fallback limiter used until the API is backed by a shared
 * Redis store. The API must not treat this as sufficient for horizontally
 * scaled production deployments; the store boundary is intentionally kept
 * behind this small interface so it can be replaced without changing route
 * policy definitions.
 */
export class InMemoryRateLimiter {
    policy;
    buckets = new Map();
    constructor(policy) {
        this.policy = policy;
    }
    check(key, now = Date.now()) {
        const current = this.buckets.get(key);
        if (!current || current.resetAt <= now) {
            const resetAt = now + this.policy.windowMs;
            this.buckets.set(key, { count: 1, resetAt });
            return {
                allowed: true,
                limit: this.policy.max,
                remaining: Math.max(0, this.policy.max - 1),
                resetAt,
            };
        }
        if (current.count >= this.policy.max) {
            return {
                allowed: false,
                limit: this.policy.max,
                remaining: 0,
                resetAt: current.resetAt,
            };
        }
        current.count += 1;
        return {
            allowed: true,
            limit: this.policy.max,
            remaining: Math.max(0, this.policy.max - current.count),
            resetAt: current.resetAt,
        };
    }
    clear() {
        this.buckets.clear();
    }
}
export const defaultRateLimitKey = (request) => {
    return request.ip || request.socket.remoteAddress || 'unknown';
};
export const rateLimitPreHandler = (limiter, key = defaultRateLimitKey) => {
    return async (request, reply) => {
        const decision = limiter.check(key(request));
        const resetSeconds = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
        reply.header('RateLimit-Limit', decision.limit);
        reply.header('RateLimit-Remaining', decision.remaining);
        reply.header('RateLimit-Reset', resetSeconds);
        if (!decision.allowed) {
            reply.header('Retry-After', resetSeconds);
            reply.code(429).send({
                success: false,
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Retry later.',
            });
        }
    };
};
/**
 * Store-backed limiter: with the PostgreSQL store the window is shared by every API instance.
 * If the store errors the request is rejected (503) rather than silently allowed: fail closed.
 */
export const sharedRateLimitPreHandler = (store, policy, key = defaultRateLimitKey) => {
    return async (request, reply) => {
        let decision;
        try {
            decision = await store.hit(`rl:${policy.name}:${key(request)}`, policy.max, policy.windowMs);
        }
        catch {
            reply.code(503).send({ success: false, error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Service temporarily unavailable.' } });
            return;
        }
        const resetSeconds = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
        reply.header('RateLimit-Limit', decision.limit);
        reply.header('RateLimit-Remaining', decision.remaining);
        reply.header('RateLimit-Reset', resetSeconds);
        if (!decision.allowed) {
            reply.header('Retry-After', resetSeconds);
            reply.code(429).send({ success: false, error: 'Too Many Requests', message: 'Rate limit exceeded. Retry later.' });
        }
    };
};
//# sourceMappingURL=rate-limit.js.map