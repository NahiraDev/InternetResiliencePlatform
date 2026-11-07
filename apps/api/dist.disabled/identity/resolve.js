import { createSqlClient } from '@irp/database';
import { createMemoryIdentityRepositories } from './memory.js';
import { createPostgresIdentityRepositories } from './postgres.js';
const isProduction = (env) => ['production', 'staging'].includes((env.NODE_ENV ?? '').toLowerCase());
/**
 * Production/staging must have PostgreSQL: there is deliberately no fallback to process memory there.
 * Outside production, an absent DATABASE_URL yields the labelled `development-memory` store.
 */
export const resolveIdentityRepositories = (env = process.env, warn = (m) => process.stderr.write(`${m}\n`)) => {
    const url = env.DATABASE_URL;
    if (url)
        return createPostgresIdentityRepositories(createSqlClient(url, { max: Number(env.IRP_DB_POOL_MAX ?? 5) }));
    if (isProduction(env))
        throw new Error('DATABASE_URL is required for production or staging: refusing the in-memory identity store.');
    warn('[irp-api] DATABASE_URL not set: using NON-DURABLE development-memory identity store (users, sessions and tokens are lost on restart).');
    return createMemoryIdentityRepositories();
};
//# sourceMappingURL=resolve.js.map