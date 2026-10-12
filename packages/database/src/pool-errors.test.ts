import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pools: EventEmitter[] = [];

vi.mock('pg', () => ({
  Pool: vi.fn(function () {
    const pool = Object.assign(new EventEmitter(), {
      query: vi.fn(async () => ({ rows: [{ ok: 1 }] })),
      end: vi.fn(async () => undefined),
    });
    pools.push(pool);
    return pool;
  }),
}));

const { createPrismaClient, createGeneratedPrismaClient } = await import('./index.js');

describe('database pool idle-client errors', () => {
  afterEach(() => {
    pools.length = 0;
    vi.restoreAllMocks();
  });

  it('registers an error listener so a database restart cannot crash the process', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    createPrismaClient('postgresql://irp:irp@127.0.0.1:5432/irp');
    const pool = pools[0];
    expect(pool).toBeDefined();
    expect(pool!.listenerCount('error')).toBe(1);
    // EventEmitter#emit throws for an unhandled 'error' event; with the
    // listener registered it must not.
    expect(() =>
      pool!.emit('error', new Error('terminating connection due to administrator command')),
    ).not.toThrow();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('database idle client error'));
  });

  it('accepts a caller-supplied idle-client error handler', async () => {
    const onIdleClientError = vi.fn();
    await createGeneratedPrismaClient('postgresql://irp:irp@127.0.0.1:5432/irp', {
      onIdleClientError,
    });
    const error = new Error('connection terminated unexpectedly');
    pools[0]!.emit('error', error);
    expect(onIdleClientError).toHaveBeenCalledWith(error);
  });

  it('keeps the in-memory client when no database URL is configured', async () => {
    const client = createPrismaClient('');
    expect(pools).toHaveLength(0);
    await expect(client.$queryRaw`SELECT 1`).resolves.toEqual([{ ok: 1 }]);
  });
});
