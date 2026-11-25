import { createSqlClient, type SqlExecutor } from '@irp/database';
import { createMemoryIdentityRepositories } from './identity/memory.js';
import { createPostgresIdentityRepositories } from './identity/postgres.js';
import type { IdentityRepositories } from './identity/types.js';
import {
  createMemoryRemoteClientStore,
  createPostgresRemoteClientStore,
  type RemoteClientKeys,
  type RemoteClientStore,
} from './remote-client-store.js';

/**
 * API state durability (issue #410).
 *
 * Production and staging must never serve state from process memory: a cold start loses it and a second
 * instance disagrees about it. Every API surface that keeps state therefore either talks to PostgreSQL or
 * calls `requireDurableOrDevelopment`, which throws in production/staging and is a no-op elsewhere.
 * `docs/architecture/api-state-durability.md` is the inventory; `durability-inventory.test.ts` enforces it.
 */

export const isProductionRuntime = (env: NodeJS.ProcessEnv = process.env): boolean =>
  ['production', 'staging'].includes((env.NODE_ENV ?? '').toLowerCase());

export class DurableStoreRequiredError extends Error {
  readonly code = 'DURABLE_STORE_REQUIRED';
  constructor(surface: string) {
    super(
      `${surface} has no durable store: refusing to fall back to process memory in production or staging.`,
    );
    this.name = 'DurableStoreRequiredError';
  }
}

/** Throws in production/staging when `durable` is false. Outside production the in-memory store is allowed. */
export const requireDurableOrDevelopment = (
  surface: string,
  durable: boolean,
  env: NodeJS.ProcessEnv = process.env,
): void => {
  if (!durable && isProductionRuntime(env)) throw new DurableStoreRequiredError(surface);
};

/** Small key/value store for operator-controlled settings that must be identical across instances. */
export interface SettingsStore {
  readonly kind: 'postgres' | 'development-memory';
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export const createMemorySettingsStore = (): SettingsStore => {
  const values = new Map<string, unknown>();
  return {
    kind: 'development-memory',
    async get<T>(key: string) {
      return values.get(key) as T | undefined;
    },
    async set(key, value) {
      values.set(key, value);
    },
  };
};

export const createPostgresSettingsStore = (sql: SqlExecutor): SettingsStore => ({
  kind: 'postgres',
  async get<T>(key: string) {
    const rows = await sql.query<{ value: T }>(`SELECT "value" FROM "PlatformSetting" WHERE "key"=$1`, [
      key,
    ]);
    return rows[0]?.value;
  },
  async set(key, value) {
    await sql.query(
      `INSERT INTO "PlatformSetting" ("key","value","updatedAt") VALUES ($1,$2::jsonb,$3)
       ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=EXCLUDED."updatedAt"`,
      [key, JSON.stringify(value), new Date().toISOString()],
    );
  },
});

export interface DurableStores {
  readonly kind: 'postgres' | 'development-memory';
  readonly identity: IdentityRepositories;
  readonly remoteClient: RemoteClientStore;
  readonly settings: SettingsStore;
}

/**
 * Builds every durable store on ONE connection pool (so adding stores does not multiply connections per
 * serverless instance). `identity.close()` owns the pool. Production/staging without DATABASE_URL throws.
 */
export const resolveDurableStores = (
  keys: RemoteClientKeys,
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = (m) => process.stderr.write(`${m}\n`),
): DurableStores => {
  const url = env.DATABASE_URL;
  if (url) {
    const sql = createSqlClient(url, { max: Number(env.IRP_DB_POOL_MAX ?? 5) });
    return {
      kind: 'postgres',
      identity: createPostgresIdentityRepositories(sql),
      remoteClient: createPostgresRemoteClientStore(sql, keys),
      settings: createPostgresSettingsStore(sql),
    };
  }
  if (isProductionRuntime(env))
    throw new Error(
      'DATABASE_URL is required for production or staging: refusing the in-memory identity store.',
    );
  warn(
    '[irp-api] DATABASE_URL not set: using NON-DURABLE development-memory stores (users, sessions, tokens, device credentials and settings are lost on restart).',
  );
  return {
    kind: 'development-memory',
    identity: createMemoryIdentityRepositories(),
    remoteClient: createMemoryRemoteClientStore(keys),
    settings: createMemorySettingsStore(),
  };
};
