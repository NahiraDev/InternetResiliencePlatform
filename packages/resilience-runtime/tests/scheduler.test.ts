import { describe, expect, it, vi } from 'vitest';
import { RuntimeScheduler } from '../src/scheduler.js';

const config = {
  enabled: true,
  mode: 'safe' as const,
  cycleIntervalMs: 1_000,
  maxConcurrentCycles: 1,
  cooldownMs: 0,
  executionBudgetMs: 250,
};

describe('RuntimeScheduler', () => {
  it('passes its execution budget to the canonical runtime as a mutation deadline', async () => {
    const cycle = vi.fn().mockResolvedValue({});
    const scheduler = new RuntimeScheduler({ cycle } as never, config);
    const before = Date.now();

    await scheduler.runOnce();

    expect(cycle).toHaveBeenCalledTimes(1);
    const input = cycle.mock.calls[0]?.[0];
    expect(input.mode).toBe('safe');
    const deadline = Date.parse(input.deadline);
    expect(deadline).toBeGreaterThanOrEqual(before + config.executionBudgetMs - 25);
    expect(deadline).toBeLessThanOrEqual(Date.now() + config.executionBudgetMs + 25);
    expect(scheduler.status()).toMatchObject({
      active: 0,
      runsTotal: 1,
      failedTotal: 0,
    });
  });

  it('keeps the scheduler active until a slow canonical cycle settles', async () => {
    let settle!: () => void;
    const cycle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const scheduler = new RuntimeScheduler({ cycle } as never, {
      ...config,
      executionBudgetMs: 1,
    });

    const running = scheduler.runOnce();
    await vi.waitFor(() => expect(cycle).toHaveBeenCalledTimes(1));
    await scheduler.runOnce();
    expect(scheduler.status()).toMatchObject({
      active: 1,
      overlapPreventedTotal: 1,
      skippedTotal: 1,
    });

    settle();
    await running;
    expect(scheduler.status().active).toBe(0);
  });

  it('retains canonical runtime failures in scheduler status', async () => {
    const scheduler = new RuntimeScheduler(
      { cycle: vi.fn().mockRejectedValue(new Error('verification failed')) } as never,
      config,
    );

    await scheduler.runOnce();

    expect(scheduler.status()).toMatchObject({
      active: 0,
      failedTotal: 1,
      skippedTotal: 1,
      lastFailure: 'verification failed',
    });
  });
});
