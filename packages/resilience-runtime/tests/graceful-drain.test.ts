import { describe, expect, it } from 'vitest';
import { RuntimeScheduler } from '../src/scheduler.js';

const cfg = { enabled: true, mode: 'safe' as const, cycleIntervalMs: 1000, maxConcurrentCycles: 1, cooldownMs: 0, executionBudgetMs: 1000 };

describe('graceful drain', () => {
  it('scheduler.whenIdle waits for the running cycle to finish', async () => {
    let finish: () => void = () => undefined;
    const scheduler = new RuntimeScheduler({ cycle: () => new Promise((resolve) => { finish = () => resolve({} as never); }) } as never, cfg);
    const run = scheduler.runOnce();
    await new Promise((r) => setTimeout(r, 20));
    expect(await scheduler.whenIdle(60)).toBe(false); // still running: caller learns it was not drained
    setTimeout(finish, 30);
    expect(await scheduler.whenIdle(2000)).toBe(true);
    await run;
  });

  it('an operator cycle holding the runtime is overlap prevention, not a scheduler failure', async () => {
    const scheduler = new RuntimeScheduler({ cycle: async () => { throw new Error('runtime cycle already active'); } } as never, cfg);
    await scheduler.runOnce();
    expect(scheduler.status()).toMatchObject({ failedTotal: 0, overlapPreventedTotal: 1 });
  });

  it('a genuine cycle failure is still counted as a failure', async () => {
    const scheduler = new RuntimeScheduler({ cycle: async () => { throw new Error('observation exploded'); } } as never, cfg);
    await scheduler.runOnce();
    expect(scheduler.status()).toMatchObject({ failedTotal: 1, lastFailure: 'observation exploded' });
  });
});
