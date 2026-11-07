import type { IdentityRepositories } from './types.js';
/**
 * Production/staging must have PostgreSQL: there is deliberately no fallback to process memory there.
 * Outside production, an absent DATABASE_URL yields the labelled `development-memory` store.
 */
export declare const resolveIdentityRepositories: (env?: NodeJS.ProcessEnv, warn?: (message: string) => void) => IdentityRepositories;
//# sourceMappingURL=resolve.d.ts.map