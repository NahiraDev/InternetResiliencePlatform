import { describe, expect, it } from 'vitest';
import { MemoryQueue, QueueBackpressureError } from './index.js';

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

  it('rejects with backpressure instead of growing without bound (issue #283)', async () => {
    const queue = new MemoryQueue({ maxSize: 2 });
    await queue.enqueue('net.event', { id: 1 });
    await queue.enqueue('net.event', { id: 2 });

    await expect(queue.enqueue('net.event', { id: 3 })).rejects.toBeInstanceOf(
      QueueBackpressureError,
    );
    expect(queue.size()).toBe(2);

    const status = queue.status();
    expect(status.size).toBe(2);
    expect(status.maxSize).toBe(2);
    expect(status.enqueuedTotal).toBe(2);
    expect(status.rejectedTotal).toBe(1);
  });

  it('supports drop-oldest overflow for loss-tolerant telemetry streams', async () => {
    const queue = new MemoryQueue({ maxSize: 2, overflowPolicy: 'drop-oldest' });
    await queue.enqueue('telemetry', { id: 1 });
    await queue.enqueue('telemetry', { id: 2 });
    await queue.enqueue('telemetry', { id: 3 });

    expect(queue.size()).toBe(2);
    expect(queue.status().droppedTotal).toBe(1);
  });

  it('rejects invalid bounds at construction', () => {
    expect(() => new MemoryQueue({ maxSize: 0 })).toThrow(RangeError);
  });
});
