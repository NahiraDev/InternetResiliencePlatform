import type { RuntimeContext } from './domain/types.js';
import type { ObservationProvider } from './ports/ports.js';
import { ResilienceRuntime, type ResilienceRuntimeOptions } from './runtime.js';
import {
  ProgrammableConnectivityFabric,
  type FabricDiscoveryProvider,
  type FabricSelectionRequest,
  type FabricSelectionResult,
} from './fabric.js';
import type { IntentStore } from './intent/arbitration.js';
import { PostgresIntentStore, type PostgresConfig } from './intent/postgres-store.js';
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

export type CanonicalRuntimeCycleInput = Omit<
  Partial<RuntimeContext> & { idempotencyKey?: string },
  'mode'
>;

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

const runtimeModeFor = (executionMode: CanonicalExecutionMode) =>
  executionMode === 'real' ? ('live' as const) : ('simulation' as const);

/**
 * Creates a PostgresIntentStore from environment variables.
 * Expected env vars:
 * - IRP_INTENT_DB_HOST
 * - IRP_INTENT_DB_PORT (default: 5432)
 * - IRP_INTENT_DB_NAME
 * - IRP_INTENT_DB_USER
 * - IRP_INTENT_DB_PASSWORD
 * - IRP_INTENT_DB_SSL (optional, default: false)
 * - IRP_INTENT_DB_MAX (optional, default: 10)
 */
export const createPostgresIntentStore = async (): Promise<IntentStore | undefined> => {
  const host = process.env.IRP_INTENT_DB_HOST;
  if (!host) return undefined;

  const config: PostgresConfig = {
    host,
    port: parseInt(process.env.IRP_INTENT_DB_PORT ?? '5432', 10),
    database: process.env.IRP_INTENT_DB_NAME ?? 'irp',
    user: process.env.IRP_INTENT_DB_USER ?? 'irp',
    password: process.env.IRP_INTENT_DB_PASSWORD ?? '',
    ssl: process.env.IRP_INTENT_DB_SSL === 'true',
    max: parseInt(process.env.IRP_INTENT_DB_MAX ?? '10', 10),
  };

  const store = new PostgresIntentStore(config);
  await store.initialize();
  return store;
};

export const createCanonicalRuntime = (
  options: CanonicalRuntimeCompositionOptions,
): CanonicalRuntimeComposition => {
  const {
    executionMode,
    observationProviders = [],
    fabric,
    fabricDiscoveryProviders = [],
    intentStore,
    knowledgeStore,
    learningLoop,
    learningLoopOptions,
    ...runtimeOptions
  } = options;

  const runtime = new ResilienceRuntime(observationProviders, {
    ...runtimeOptions,
    ...(intentStore !== undefined ? { intentStore } : {}),
  });
  const connectivityFabric = fabric ?? new ProgrammableConnectivityFabric();
  for (const provider of fabricDiscoveryProviders) connectivityFabric.registerProvider(provider);

  // One knowledge boundary and one learning closure per composed runtime. These
  // are owned here so a host cannot construct a private, divergent copy.
  const canonicalKnowledgeStore = knowledgeStore ?? new KnowledgeStore();
  const canonicalLearningLoop =
    learningLoop ?? new OutcomeLearningLoop(learningLoopOptions ?? { knowledgeStore: canonicalKnowledgeStore });

  return Object.freeze({
    executionMode,
    runtime,
    fabric: connectivityFabric,
    knowledgeStore: canonicalKnowledgeStore,
    learningLoop: canonicalLearningLoop,
    discoverFabricResources: (discoveryOptions = {}) =>
      connectivityFabric.discover(discoveryOptions),
    selectFabricResource: (request = {}) => connectivityFabric.select(request),
    runCycle: (input: CanonicalRuntimeCycleInput = {}) =>
      runtime.runCycle({ ...input, mode: runtimeModeFor(executionMode) }),
  });
};

/**
 * Async version that auto-creates PostgresIntentStore from environment variables.
 * Use this when you need durable intent persistence.
 */
export const createCanonicalRuntimeWithPostgres = async (
  options: CanonicalRuntimeCompositionOptions,
): Promise<CanonicalRuntimeComposition> => {
  const {
    executionMode,
    observationProviders = [],
    fabric,
    fabricDiscoveryProviders = [],
    intentStore,
    knowledgeStore,
    learningLoop,
    learningLoopOptions,
    ...runtimeOptions
  } = options;

  // Auto-create PostgresIntentStore from env if not provided
  const resolvedIntentStore = intentStore ?? (await createPostgresIntentStore());

  const runtime = new ResilienceRuntime(observationProviders, {
    ...runtimeOptions,
    ...(resolvedIntentStore !== undefined ? { intentStore: resolvedIntentStore } : {}),
  });
  const connectivityFabric = fabric ?? new ProgrammableConnectivityFabric();
  for (const provider of fabricDiscoveryProviders) connectivityFabric.registerProvider(provider);

  // One knowledge boundary and one learning closure per composed runtime. These
  // are owned here so a host cannot construct a private, divergent copy.
  const canonicalKnowledgeStore = knowledgeStore ?? new KnowledgeStore();
  const canonicalLearningLoop =
    learningLoop ?? new OutcomeLearningLoop(learningLoopOptions ?? { knowledgeStore: canonicalKnowledgeStore });

  return Object.freeze({
    executionMode,
    runtime,
    fabric: connectivityFabric,
    knowledgeStore: canonicalKnowledgeStore,
    learningLoop: canonicalLearningLoop,
    discoverFabricResources: (discoveryOptions = {}) =>
      connectivityFabric.discover(discoveryOptions),
    selectFabricResource: (request = {}) => connectivityFabric.select(request),
    runCycle: (input: CanonicalRuntimeCycleInput = {}) =>
      runtime.runCycle({ ...input, mode: runtimeModeFor(executionMode) }),
  });
};
