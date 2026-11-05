export type DatabaseClient = {
    $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    $disconnect(): Promise<void>;
};
export type IdleClientErrorHandler = (error: Error) => void;
/**
 * Default handler for errors emitted by idle pooled clients. node-postgres
 * emits 'error' on the pool when an idle client loses its connection (for
 * example a PostgreSQL restart, failover or `pg_terminate_backend`). Without a
 * listener Node treats it as an unhandled 'error' event and terminates the
 * process, turning a recoverable database outage into an API crash. The pool
 * discards the broken client and the next query reconnects; in-flight and
 * subsequent queries still reject, so readiness checks report the outage.
 */
export declare const reportIdleClientError: IdleClientErrorHandler;
export interface DatabaseClientOptions {
    onIdleClientError?: IdleClientErrorHandler;
    max?: number;
}
export declare const createPrismaClient: (databaseUrl?: string | undefined, options?: DatabaseClientOptions) => DatabaseClient;
export declare const createGeneratedPrismaClient: (databaseUrl?: string | undefined, options?: DatabaseClientOptions) => Promise<DatabaseClient>;
/**
 * Parameterised SQL access with real transactions. Unlike the tagged `$queryRaw` helper this exposes
 * `query(text, values)` (needed for dynamic ORDER BY / multi-statement atomicity) and `transaction()`.
 * There is intentionally NO in-memory fallback: callers that have no DATABASE_URL must choose an
 * explicitly-labelled in-memory repository instead of a SQL client that silently pretends to succeed.
 */
export interface SqlExecutor {
    query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<T[]>;
}
export interface SqlClient extends SqlExecutor {
    transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
    end(): Promise<void>;
}
export interface SqlClientOptions extends DatabaseClientOptions {
    connectionTimeoutMs?: number;
    idleTimeoutMs?: number;
    statementTimeoutMs?: number;
}
export declare const createSqlClient: (databaseUrl: string, options?: SqlClientOptions) => SqlClient;
export interface DatabaseHealth {
    ok: boolean;
    latencyMs: number;
}
export declare const checkDatabaseHealth: (client: Pick<DatabaseClient, "$queryRaw">) => Promise<DatabaseHealth>;
export interface IntentRecordRow {
    id: string;
    version: number;
    status: string;
    priority: string;
    spec: unknown;
    createdAt: Date | string;
    updatedAt: Date | string;
    effectiveFrom?: Date | string | null;
    expiresAt?: Date | string | null;
    supersedes?: string | null;
    metadata: unknown;
    provenance?: string | null;
    confidence?: number | null;
    autonomy?: string | null;
    ownerPrincipalId: string;
    organizationId?: string | null;
    ownerScopeKey: string;
    idempotencyKey?: string | null;
    idempotencyFingerprint?: string | null;
}
export declare class IntentRepositoryConflictError extends Error {
    readonly code = "INTENT_REPOSITORY_CONFLICT";
    constructor(message?: string);
}
export interface IntentConflictRow {
    id: string;
    intentAId: string;
    intentBId: string;
    reason: string;
    resolution: string;
    ownerScopeKey: string;
    recordedAt: Date | string;
}
export interface IntentRepository {
    get(id: string, ownerScopeKey: string): Promise<IntentRecordRow | undefined>;
    list(status: string | undefined, ownerScopeKey: string, limit?: number): Promise<readonly IntentRecordRow[]>;
    put(row: IntentRecordRow, expectedVersion?: number): Promise<void>;
    findByIdempotency(ownerScopeKey: string, key: string): Promise<IntentRecordRow | undefined>;
    recordConflict(row: IntentConflictRow): Promise<void>;
    listConflicts(ownerScopeKey: string, limit?: number, since?: Date | string): Promise<readonly IntentConflictRow[]>;
    getConflict(id: string, ownerScopeKey: string): Promise<IntentConflictRow | undefined>;
}
export declare const createIntentRepository: (client: Pick<DatabaseClient, "$queryRaw">) => IntentRepository;
//# sourceMappingURL=index.d.ts.map