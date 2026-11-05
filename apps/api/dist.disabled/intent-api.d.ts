import { type NetworkIntent } from '@irp/core';
import type { Principal } from '@irp/auth';
import { type DatabaseClient } from '@irp/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
export interface IntentOwnership {
    readonly principalId: string;
    readonly organizationId?: string;
}
export interface IntentApiStore {
    get(id: string, ownership: IntentOwnership): Promise<NetworkIntent | undefined>;
    list(status: NetworkIntent['status'] | undefined, ownership: IntentOwnership, limit: number): Promise<readonly NetworkIntent[]>;
    put(intent: NetworkIntent, ownership: IntentOwnership, options?: {
        idempotencyKey?: string;
        idempotencyFingerprint?: string;
        expectedVersion?: number;
    }): Promise<void>;
    findByIdempotency(ownership: IntentOwnership, key: string): Promise<{
        intent: NetworkIntent;
        fingerprint: string;
    } | undefined>;
}
export interface ArbitrationConflict {
    readonly intentA: {
        intentId: string;
        desiredOutcome: string;
        priority: NetworkIntent['priority'];
        version: number;
    };
    readonly intentB: {
        intentId: string;
        desiredOutcome: string;
        priority: NetworkIntent['priority'];
        version: number;
    };
    readonly reason: string;
    readonly resolution: 'supersede-a' | 'supersede-b' | 'queue-b' | 'merge';
    readonly timestamp: string;
}
export interface ConflictApiStore {
    listConflicts(ownership: IntentOwnership, limit: number, since?: Date): Promise<readonly ArbitrationConflict[]>;
}
export declare class InMemoryIntentStore implements IntentApiStore, ConflictApiStore {
    private readonly intents;
    private readonly conflicts;
    recordConflict(_conflict: ArbitrationConflict): void;
    getConflict(id: string): Promise<ArbitrationConflict | undefined>;
    listConflicts(ownership: IntentOwnership, limit: number, since?: Date): Promise<readonly ArbitrationConflict[]>;
    get(id: string, ownership: IntentOwnership): Promise<NetworkIntent | undefined>;
    list(status: NetworkIntent['status'] | undefined, ownership: IntentOwnership, limit: number): Promise<readonly NetworkIntent[]>;
    put(intent: NetworkIntent, ownership: IntentOwnership, options?: {
        idempotencyKey?: string;
        idempotencyFingerprint?: string;
        expectedVersion?: number;
    }): Promise<void>;
    findByIdempotency(ownership: IntentOwnership, key: string): Promise<{
        intent: NetworkIntent;
        fingerprint: string;
    } | undefined>;
}
export declare class DatabaseIntentStore implements IntentApiStore, ConflictApiStore {
    private readonly repository;
    private readonly conflictMirror;
    /**
     * Degradable write buffer for conflict records: when the database is
     * unavailable, records are retained locally and retried on the next read,
     * so exporter/collector outages degrade the journal rather than losing it.
     */
    private readonly conflictPending;
    constructor(client: Pick<DatabaseClient, '$queryRaw'>);
    private conflictId;
    recordConflict(conflict: ArbitrationConflict, ownership?: IntentOwnership): Promise<void>;
    private toArbitrationConflict;
    getConflict(id: string, ownership: IntentOwnership): Promise<ArbitrationConflict | undefined>;
    listConflicts(ownership: IntentOwnership, limit: number, since?: Date): Promise<readonly ArbitrationConflict[]>;
    get(id: string, ownership: IntentOwnership): Promise<NetworkIntent | undefined>;
    list(status: NetworkIntent['status'] | undefined, ownership: IntentOwnership, limit: number): Promise<NetworkIntent[]>;
    put(intent: NetworkIntent, ownership: IntentOwnership, options?: {
        idempotencyKey?: string;
        idempotencyFingerprint?: string;
        expectedVersion?: number;
    }): Promise<void>;
    findByIdempotency(ownership: IntentOwnership, key: string): Promise<{
        intent: NetworkIntent;
        fingerprint: string;
    } | undefined>;
}
export interface IntentApiOptions {
    store?: IntentApiStore & ConflictApiStore;
    database?: Pick<DatabaseClient, '$queryRaw'>;
    onActivated?: (intent: NetworkIntent) => Promise<unknown> | unknown;
    requirePermission?: (request: FastifyRequest, permission: 'runtime.inspect' | 'runtime.execute') => Promise<Principal>;
}
export declare const registerIntentRoutes: (app: FastifyInstance, options?: IntentApiOptions) => {
    store: IntentApiStore & ConflictApiStore;
};
//# sourceMappingURL=intent-api.d.ts.map