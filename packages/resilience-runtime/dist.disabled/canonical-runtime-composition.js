import { ResilienceRuntime } from './runtime.js';
import { ProgrammableConnectivityFabric, } from './fabric.js';
import { PostgresIntentStore } from './intent/postgres-store.js';
import { KnowledgeStore } from './knowledge/knowledge-store.js';
import { OutcomeLearningLoop } from './learning/outcome-learning-loop.js';
const runtimeModeFor = (executionMode) => executionMode === 'real' ? 'live' : 'simulation';
/** Parses a required-positive-integer setting, or returns the default. */
const positiveIntegerSetting = (raw, fallback, name, max = Number.MAX_SAFE_INTEGER) => {
    if (raw === undefined || raw.trim() === '')
        return fallback;
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
const booleanSetting = (raw, fallback, name) => {
    if (raw === undefined || raw.trim() === '')
        return fallback;
    const normalized = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized))
        return true;
    if (['false', '0', 'no', 'off'].includes(normalized))
        return false;
    throw new Error(`${name} must be a boolean, received '${raw}'`);
};
/**
 * Reads and validates intent-persistence settings from the environment.
 *
 * Returns `undefined` when persistence is not configured, which is the default:
 * Postgres is an optional capability, never a requirement for local autonomy.
 * Malformed settings throw so a host fails closed at startup rather than
 * discovering a NaN port after a cycle is already running.
 */
export const readPersistenceSettings = (env = process.env) => {
    const host = env.IRP_INTENT_DB_HOST;
    if (host === undefined || host.trim() === '')
        return undefined;
    const settings = {
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
export const createPostgresIntentStore = async (env = process.env) => {
    const settings = readPersistenceSettings(env);
    if (settings === undefined)
        return undefined;
    const config = {
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
export const createCanonicalRuntime = (options) => {
    const { executionMode, observationProviders = [], fabric, fabricDiscoveryProviders = [], intentStore, knowledgeStore, learningLoop, learningLoopOptions, ...runtimeOptions } = options;
    // One knowledge boundary and one learning closure per composed runtime. These
    // are owned here so a host cannot construct a private, divergent copy.
    const canonicalKnowledgeStore = knowledgeStore ?? new KnowledgeStore();
    const canonicalLearningLoop = learningLoop ??
        new OutcomeLearningLoop(learningLoopOptions ?? { knowledgeStore: canonicalKnowledgeStore });
    const runtime = new ResilienceRuntime(observationProviders, {
        ...runtimeOptions,
        ...(intentStore !== undefined ? { intentStore } : {}),
        knowledgeStore: canonicalKnowledgeStore,
        // The loop is injected, not merely returned: the runtime must be able to
        // step it, otherwise the learning closure is decorative.
        learningLoop: canonicalLearningLoop,
    });
    const connectivityFabric = fabric ?? new ProgrammableConnectivityFabric();
    for (const provider of fabricDiscoveryProviders)
        connectivityFabric.registerProvider(provider);
    return Object.freeze({
        executionMode,
        runtime,
        fabric: connectivityFabric,
        knowledgeStore: canonicalKnowledgeStore,
        learningLoop: canonicalLearningLoop,
        discoverFabricResources: (discoveryOptions = {}) => connectivityFabric.discover(discoveryOptions),
        selectFabricResource: (request = {}) => connectivityFabric.select(request),
        runCycle: (input = {}) => runtime.runCycle({ ...input, mode: runtimeModeFor(executionMode) }),
    });
};
/**
 * Async composition that opts into durable intent persistence when it is
 * configured. It delegates to `createCanonicalRuntime` so there is exactly one
 * composition authority.
 */
export const createCanonicalRuntimeWithPostgres = async (options) => {
    const intentStore = options.intentStore ?? (await createPostgresIntentStore());
    return createCanonicalRuntime({
        ...options,
        ...(intentStore !== undefined ? { intentStore } : {}),
    });
};
//# sourceMappingURL=canonical-runtime-composition.js.map