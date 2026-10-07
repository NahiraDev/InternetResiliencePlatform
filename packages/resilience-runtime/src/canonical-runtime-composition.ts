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

/** Parses a required-positive-integer setting, or returns the default. */
const positiveIntegerSetting = (
  raw: string | undefined,
  fallback: number,
  name: string,
  max = Number.MAX_SAFE_INTEGER,
): number => {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}, received '${raw}'`);
  }
  return parsed;
};

/**
 * Parses an optional boolean setting. Accepts the forms operators actually use
 * and rejects anything else, rather than silently treating `1`/`yes` as false.
 */
const booleanSetting = (
  raw: string | undefined,
  fallback: boolean,
  name: string,
): boolean => {
  if (raw === undefined || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean, received '${raw}'`);
};

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
export const readPersistenceSettings = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): PersistenceSettings | undefined => {
  const host = env.IRP_INTENT_DB_HOST;
  if (host === undefined || host.trim() === '') return undefined;
  const settings: PersistenceSettings = {
    host,
    port: positiveIntegerSetting(env.IRP_INTENT_DB_PORT, 5432, 'IRP_INTENT_DB_PORT', 65_535),
    database: env.IRP_INTENT_DB_NAME ?? 'irp',
    user: env.IRP_INTENT_DB_USER ?? 'irp',
    password: env.IRP_INTENT_DB_PASSWORD ?? '',
    ssl: booleanSetting(env.IRP_INTENT_DB_SSL, false, 'IRP_INTENT_DB_SSL'),
    max: positiveIntegerSetting(env.IRP_INTENT_DB_MAX, 10, 'IRP_INTENT_DB_MAX'),
  };
  if (!settings.database.trim() || !settings.user.trim()) {
    throw new Error('IRP_INTENT_DB_NAME and IRP_INTENT_DB_USER must not be blank');
  }
  return settings;
};

/**
 * Creates a PostgresIntentStore from validated environment settings.
 * Returns `undefined` when persistence is not configured.
 */
export const createPostgresIntentStore = async (
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<IntentStore | undefined> => {
  const settings = readPersistenceSettings(env);
  if (settings === undefined) return undefined;

  const config: PostgresConfig = {
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    password: settings.password,
    ssl: settings.ssl,
    max: settings.max,
  };
  // Validate before opening a pool: malformed settings must fail closed at
  // startup, not after a connection attempt.
  const store = new PostgresIntentStore(config);
  store.assertValidConfig();
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

  // One knowledge boundary and one learning closure per composed runtime. These
  // are owned here so a host cannot construct a private, divergent copy.
  const canonicalKnowledgeStore = knowledgeStore ?? new KnowledgeStore();
  const canonicalLearningLoop =
    learningLoop ??
    new OutcomeLearningLoop(
      learningLoopOptions ?? { knowledgeStore: canonicalKnowledgeStore },
    );

  const runtime = new ResilienceRuntime(observationProviders, {
    ...runtimeOptions,
    ...(intentStore !== undefined ? { intentStore } : {}),
    knowledgeStore: canonicalKnowledgeStore,
    // The loop is injected, not merely returned: the runtime must be able to
    // step it, otherwise the learning closure is decorative.
    learningLoop: canonicalLearningLoop,
  });
  const connectivityFabric = fabric ?? new ProgrammableConnectivityFabric();
  for (const provider of fabricDiscoveryProviders) connectivityFabric.registerProvider(provider);

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
 * Async composition that opts into durable intent persistence when it is
 * configured. It delegates to `createCanonicalRuntime` so there is exactly one
 * composition authority.
 */
export const createCanonicalRuntimeWithPostgres = async (
  options: CanonicalRuntimeCompositionOptions,
): Promise<CanonicalRuntimeComposition> => {
  const intentStore = options.intentStore ?? (await createPostgresIntentStore());
  return createCanonicalRuntime({
    ...options,
    ...(intentStore !== undefined ? { intentStore } : {}),
  });
};