import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
const defaultRuntimeConfiguration = {
    enabled: true,
    mode: 'safe',
    cycleIntervalMs: 30000,
    maxActionsPerCycle: 3,
    maxConcurrentActions: 1,
    observationFreshnessMs: 60000,
    decisionTimeoutMs: 5000,
    verificationTimeoutMs: 10000,
    recoveryTimeoutMs: 15000,
    persistenceMode: 'memory',
    replayEnabled: true,
};
export const defaultPolicy = (mode = 'safe') => ({
    allowedActions: ['health_reprobe', 'noop', 'degraded_mode', 'recovery', 'rollback'],
    deniedActions: [],
    capabilityRequirements: {},
    securityConstraints: ['trusted-context'],
    actionBudget: 3,
    maxConcurrentActions: 1,
    confidenceThreshold: 0.5,
    telemetryFreshnessMs: 60000,
    simulationOnly: mode !== 'live',
    failClosed: true,
});
export const createPolicySnapshot = (policy = defaultPolicy()) => deepFreeze({
    id: nextId('policy'),
    schemaVersion: 1,
    createdAt: nowIso(),
    source: 'resilience-runtime',
    metadata: {},
    policy,
});
export const createCapabilitySnapshot = (capabilities = [], trusted = false) => deepFreeze({
    id: nextId('cap'),
    schemaVersion: 1,
    createdAt: nowIso(),
    source: 'capability-provider',
    metadata: {},
    capabilities,
    trusted,
});
export const createRuntimeContext = (input = {}) => deepFreeze({
    runtimeId: input.runtimeId ?? 'runtime-default',
    correlationId: input.correlationId ?? nextId('corr'),
    mode: input.mode ?? input.configuration?.mode ?? 'safe',
    policySnapshot: input.policySnapshot ?? createPolicySnapshot(defaultPolicy(input.mode ?? 'safe')),
    capabilitySnapshot: input.capabilitySnapshot ?? createCapabilitySnapshot(),
    observationSnapshot: input.observationSnapshot,
    compiledIntent: input.compiledIntent,
    compiledIntents: input.compiledIntents,
    deadline: input.deadline ?? new Date(Date.now() + 5000).toISOString(),
    cancelled: input.cancelled ?? false,
    securityContext: input.securityContext ?? { trusted: false },
    configuration: input.configuration ?? defaultRuntimeConfiguration,
});
//# sourceMappingURL=context.js.map