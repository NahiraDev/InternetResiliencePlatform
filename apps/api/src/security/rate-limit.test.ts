import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from './rate-limit.js';

describe('InMemoryRateLimiter', () => {
  it('allows requests up to the configured limit', () => {
    const limiter = new InMemoryRateLimiter({ max: 2, windowMs: 60_000 });

    expect(limiter.check('client', 1_000)).toMatchObject({
      allowed: true,
      remaining: 1,
      limit: 2,
    });
    expect(limiter.check('client', 1_001)).toMatchObject({
      allowed: true,
      remaining: 0,
      limit: 2,
    });
    expect(limiter.check('client', 1_002)).toMatchObject({
      allowed: false,
      remaining: 0,
      limit: 2,
    });
  });

  it('resets the bucket after the configured window', () => {
    const limiter = new InMemoryRateLimiter({ max: 1, windowMs: 1_000 });

    expect(limiter.check('client', 1_000).allowed).toBe(true);
    expect(limiter.check('client', 1_999).allowed).toBe(false);
    expect(limiter.check('client', 2_000).allowed).toBe(true);
  });

  it('keeps clients isolated by key', () => {
    const limiter = new InMemoryRateLimiter({ max: 1, windowMs: 60_000 });

    expect(limiter.check('client-a', 1_000).allowed).toBe(true);
    expect(limiter.check('client-b', 1_000).allowed).toBe(true);
    expect(limiter.check('client-a', 1_001).allowed).toBe(false);
  });
});
