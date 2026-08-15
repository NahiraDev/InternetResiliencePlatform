import { describe, expect, it, vi } from 'vitest';
import { isDefined, nowIso, sleep } from './index.js';

describe('utils', () => {
  it('narrows nullish values without dropping valid falsy values', () => {
    expect([undefined, 0, null, '', false, 'ok'].filter(isDefined)).toEqual([0, '', false, 'ok']);
  });

  it('returns ISO timestamps and resolves sleeps through timers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:34:56.000Z'));
    const pending = sleep(25);
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toBeUndefined();
    expect(nowIso()).toBe('2026-08-15T12:34:56.025Z');
    vi.useRealTimers();
  });
});
