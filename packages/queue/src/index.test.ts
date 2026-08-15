import { describe, expect, it } from 'vitest';
import { MemoryQueue } from './index.js';

describe('MemoryQueue', () => {
  it('retains messages without a registered processor and reports queue-specific size', async () => {
    const queue = new MemoryQueue();
    await queue.enqueue('dns.probe', { domain: 'example.test' });
    await queue.enqueue('route.verify', { destination: '10.0.0.0/24' });

    expect(queue.size()).toBe(2);
    expect(queue.size('dns.probe')).toBe(1);
    expect(queue.size('missing')).toBe(0);
  });

  it('processes a matching message once and removes it after successful handling', async () => {
    const queue = new MemoryQueue();
    const handled: unknown[] = [];
    queue.process('dns.probe', (message) => {
      handled.push({ payload: message.payload, attempts: message.attempts });
    });

    const message = await queue.enqueue('dns.probe', { domain: 'example.test' });

    expect(message.attempts).toBe(1);
    expect(handled).toEqual([{ payload: { domain: 'example.test' }, attempts: 1 }]);
    expect(queue.size()).toBe(0);
  });
});
