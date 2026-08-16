import { Pool } from 'pg';

export type DatabaseClient = {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $disconnect(): Promise<void>;
};

const createMemoryDatabaseClient = (): DatabaseClient => ({
  async $queryRaw(): Promise<unknown> {
    return [{ ok: 1 }];
  },
  async $disconnect(): Promise<void> {
    return undefined;
  },
});

export const createPrismaClient = (databaseUrl = process.env.DATABASE_URL): DatabaseClient => {
  if (!databaseUrl) return createMemoryDatabaseClient();
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  return {
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> {
      const text = strings.reduce((sql, part, index) => `${sql}${part}${index < values.length ? `$${index + 1}` : ''}`, '');
      const result = await pool.query(text, values);
      return result.rows;
    },
    async $disconnect(): Promise<void> {
      await pool.end();
    },
  };
};
export const createGeneratedPrismaClient = async (
  databaseUrl = process.env.DATABASE_URL,
): Promise<DatabaseClient> => createPrismaClient(databaseUrl);
export interface DatabaseHealth {
  ok: boolean;
  latencyMs: number;
}
export const checkDatabaseHealth = async (
  client: Pick<DatabaseClient, '$queryRaw'>,
): Promise<DatabaseHealth> => {
  const started = performance.now();
  await client.$queryRaw`SELECT 1`;
  return { ok: true, latencyMs: Math.round(performance.now() - started) };
};
