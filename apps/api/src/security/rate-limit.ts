import type { FastifyReply, FastifyRequest } from 'fastify';

export type RateLimitPolicy = {
  max: number;
  windowMs: number;
  key?: (request: FastifyRequest) => string;
};

type Bucket = {
  count: number;
  resetAt: number;
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
export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly policy: RateLimitPolicy) {}

  check(key: string, now = Date.now()): RateLimitDecision {
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

  clear(): void {
    this.buckets.clear();
  }
}

export const defaultRateLimitKey = (request: FastifyRequest): string => {
  return request.ip || request.socket.remoteAddress || 'unknown';
};

export const rateLimitPreHandler = (
  limiter: InMemoryRateLimiter,
  key = defaultRateLimitKey,
) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
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
