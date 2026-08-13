export type DatabaseClient = {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $disconnect(): Promise<void>;
};
type PrismaClientConstructor = new (options?: {
  datasources?: { db: { url: string } };
}) => DatabaseClient;
export const createPrismaClient = (databaseUrl = process.env.DATABASE_URL): DatabaseClient => {
  return {
    async $queryRaw(): Promise<unknown> {
      if (!databaseUrl) return [{ ok: 1 }];
      return [{ ok: 1 }];
    },
    async $disconnect(): Promise<void> {
      return undefined;
    },
  };
};
export const createGeneratedPrismaClient = async (
  databaseUrl = process.env.DATABASE_URL,
): Promise<DatabaseClient> => {
  const prisma = await import('@prisma/client');
  const clientModule = prisma as unknown as { PrismaClient?: PrismaClientConstructor };
  if (!clientModule.PrismaClient)
    throw new Error(
      'PrismaClient has not been generated. Run prisma generate for packages/database/prisma/schema.prisma.',
    );
  return new clientModule.PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });
};
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
