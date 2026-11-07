import type { RuntimeContext } from './domain/types.js';
import type { ObservationProvider } from './ports/ports.js';
import { ResilienceRuntime, type ResilienceRuntimeOptions } from './runtime.js';
import { ProgrammableConnectivityFabric, type FabricDiscoveryProvider, type FabricSelectionRequest, type FabricSelectionResult } from './fabric.js';
import type { IntentStore } from './intent/arbitration.js';
import { KnowledgeStore } from './knowledge/knowledge-store.js';
import { OutcomeLearningLoop, type LearningLoopOptions } from './learning/outcome-learning-loop.js';
export type CanonicalExecutionMode = 'simulation' | 'real';
export interface CanonicalRuntimeCompositionOptions extends ResilienceRuntimeOptions {
    readonly executionMode: CanonicalExecutionMode;
    readonly observationProviders?: readonly ObservationProvider[];
    readonly fabric?: ProgrammableConnectivityFabric;
    readonly fabricDiscoveryProviders?: readonly FabricDiscoveryProvider[];
    readonly intentStore?: IntentStore;
    /** Shared knowledge boundary for advisory evidence. Created if absent. */
    readonly knowledgeStore?: KnowledgeStore;
    readonly learningLoop?: OutcomeLearningLoop;
    readonly learningLoopOptions?: LearningLoopOptions;
}
export type CanonicalRuntimeCycleInput = Omit<Partial<RuntimeContext> & {
    idempotencyKey?: string;
}, 'mode'>;
export interface CanonicalRuntimeComposition {
    readonly executionMode: CanonicalExecutionMode;
    readonly runtime: ResilienceRuntime;
    readonly fabric: ProgrammableConnectivityFabric;
    /**
     * The one knowledge boundary. Canonical by construction: every host obtains
     * it from this composition rather than constructing its own.
     */
    readonly knowledgeStore: KnowledgeStore;
    /** Outcome verification -> learning closure. Canonical by construction. */
    readonly learningLoop: OutcomeLearningLoop;
    discoverFabricResources(options?: {
        signal?: AbortSignal;
        limit?: number;
        since?: string;
    }): ReturnType<ProgrammableConnectivityFabric['discover']>;
    selectFabricResource(request?: FabricSelectionRequest): FabricSelectionResult;
    runCycle(input?: CanonicalRuntimeCycleInput): ReturnType<ResilienceRuntime['runCycle']>;
}
export interface PersistenceSettings {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string;
    readonly ssl: boolean;
    readonly max: number;
}
/**
 * Reads and validates intent-persistence settings from the environment.
 *
 * Returns `undefined` when persistence is not configured, which is the default:
 * Postgres is an optional capability, never a requirement for local autonomy.
 * Malformed settings throw so a host fails closed at startup rather than
 * discovering a NaN port after a cycle is already running.
 */
export declare const readPersistenceSettings: (env?: Readonly<Record<string, string | undefined>>) => PersistenceSettings | undefined;
/**
 * Creates a PostgresIntentStore from validated environment settings.
 * Returns `undefined` when persistence is not configured.
 */
export declare const createPostgresIntentStore: (env?: Readonly<Record<string, string | undefined>>) => Promise<IntentStore | undefined>;
export declare const createCanonicalRuntime: (options: CanonicalRuntimeCompositionOptions) => CanonicalRuntimeComposition;
/**
 * Async composition that opts into durable intent persistence when it is
 * configured. It delegates to `createCanonicalRuntime` so there is exactly one
 * composition authority.
 */
export declare const createCanonicalRuntimeWithPostgres: (options: CanonicalRuntimeCompositionOptions) => Promise<CanonicalRuntimeComposition>;
//# sourceMappingURL=canonical-runtime-composition.d.ts.map