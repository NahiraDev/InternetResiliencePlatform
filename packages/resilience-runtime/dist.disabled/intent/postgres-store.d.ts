/**
 * PostgreSQL-backed intent store for durable intent persistence (Phase 2).
 * Implements the IntentStore interface for production deployments.
 */
import type { CompiledIntent, IntentConflict, IntentStore } from './index.js';
export interface PostgresConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    max?: number;
}
export interface IntentRow {
    intent_id: string;
    version: number;
    priority: string;
    desired_outcome: string;
    target: Record<string, unknown>;
    constraints: Record<string, unknown>;
    objectives: Record<string, unknown>;
    confidence: number;
    provenance: string;
    autonomy: string;
    scope: Record<string, unknown>;
    effective_from: string | null;
    expires_at: string | null;
    compiled_at: string;
}
export declare class PostgresIntentStore implements IntentStore {
    private readonly config;
    private pool;
    constructor(config: PostgresConfig);
    /**
     * Validates the configuration without touching the network.
     *
     * Exposed separately from `initialize` so a host can fail closed on malformed
     * persistence settings before it constructs a store or starts a cycle.
     */
    assertValidConfig(): void;
    initialize(): Promise<void>;
    get(id: string): Promise<CompiledIntent | undefined>;
    getActive(at?: Date): Promise<readonly CompiledIntent[]>;
    put(intent: CompiledIntent): Promise<void>;
    delete(id: string): Promise<void>;
    recordConflicts(conflicts: readonly IntentConflict[]): Promise<void>;
    close(): Promise<void>;
    private rowToIntent;
}
//# sourceMappingURL=postgres-store.d.ts.map