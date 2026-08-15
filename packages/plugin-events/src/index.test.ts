import { describe, expect, it, vi } from 'vitest';
import { PluginEventBus } from './index.js';

describe('PluginEventBus', () => {
  it('publishes typed events to exact and wildcard subscribers and supports unsubscribe', async () => {
    const bus = new PluginEventBus();
    const seen: string[] = [];
    const off = bus.subscribe<{ id: string }>('plugin.ready', (e) => {
      seen.push(`${e.type}:${e.payload.id}:${e.source}`);
    });
    bus.subscribe('*', (e) => {
      seen.push(`wild:${e.type}`);
    });
    await bus.publish('plugin.ready', { id: 'a' });
    off();
    await bus.publish('plugin.ready', { id: 'b' });
    expect(seen).toEqual([
      'plugin.ready:a:plugin-runtime',
      'wild:plugin.ready',
      'wild:plugin.ready',
    ]);
  });
  it('times out unanswered request/response interactions deterministically', async () => {
    vi.useFakeTimers();
    const bus = new PluginEventBus();
    const promise = bus.request('health', { id: 'a' }, 25);
    const assertion = expect(promise).rejects.toThrow('Plugin request health timed out after 25ms');
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    vi.useRealTimers();
  });
});
