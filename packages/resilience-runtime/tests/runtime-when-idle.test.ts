import { describe, expect, it } from 'vitest';
import { createCanonicalRuntime } from '../src/index.js';

describe('ResilienceRuntime.whenIdle', () => {
  it('is immediately true with no cycle and waits for a running one', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { runtime } = createCanonicalRuntime({
      executionMode: 'simulation',
      observationProviders: [{ id: 'slow', collect: async () => { await gate; return { providerId: 'slow', observations: [], collectedAt: new Date().toISOString(), errors: [] }; } }],
    });
    expect(await runtime.whenIdle(10)).toBe(true);
    const cycle = runtime.cycle({ mode: 'simulation' });
    await new Promise((r) => setTimeout(r, 30));
    expect(await runtime.whenIdle(50)).toBe(false);
    setTimeout(release, 20);
    expect(await runtime.whenIdle(5000)).toBe(true);
    await cycle;
    expect(await runtime.whenIdle(10)).toBe(true);
  });
});
