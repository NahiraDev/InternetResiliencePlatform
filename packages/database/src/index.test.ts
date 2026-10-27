import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPrismaClient } from './index.js';

describe('phase 6 network database schema', () => {
  it('declares network intelligence models', () => {
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    expect(schema).toContain('model NetworkMeasurement');
    expect(schema).toContain('model NetworkNode');
    expect(schema).toContain('model NetworkHealthScore');
  });

  it('declares durable intent ownership and idempotency storage', () => {
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    expect(schema).toContain('model NetworkIntentRecord');
    expect(schema).toContain('ownerScopeKey String @db.VarChar(384)');
    expect(schema).toContain('@@unique([ownerScopeKey, idempotencyKey])');
  });
});

describe('createPrismaClient production safety', () => {
  const withEnv = async (
    nodeEnv: string,
    databaseUrl: string | undefined,
    callback: () => void | Promise<void>,
  ) => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.NODE_ENV = nodeEnv;
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;

    try {
      await callback();
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  };

  it('fails closed in production when DATABASE_URL is missing', async () => {
    await withEnv('production', undefined, () => {
      expect(() => createPrismaClient()).toThrow(
        'DATABASE_URL is required for production or staging database runtime',
      );
    });
  });

  it('fails closed in staging when DATABASE_URL is missing', async () => {
    await withEnv('staging', undefined, () => {
      expect(() => createPrismaClient()).toThrow(
        'DATABASE_URL is required for production or staging database runtime',
      );
    });
  });

  it('keeps the in-memory client available for local development', async () => {
    await withEnv('development', undefined, async () => {
      const client = createPrismaClient();
      await expect(client.$queryRaw`SELECT 1`).resolves.toEqual([{ ok: 1 }]);
    });
  });
});
