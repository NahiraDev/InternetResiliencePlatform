import { deepFreeze, nextId, nowIso, stableId } from '../domain/ids.js';
import { ObservationAggregator } from '../observations/observations.js';
import { IncidentCorrelator } from '../incidents/incidents.js';
import { InMemoryEventSink } from '../events/events.js';
import { InMemoryTelemetrySink } from '../telemetry/telemetry.js';
import { createRuntimeContext } from '../context/context.js';
export const defaultAutopilotPolicy = () => ({
    enabled: false,
    mode: 'OBSERVE_ONLY',
    allowedActions: ['PROBE_REFRESH', 'CACHE_REFRESH'],
    emergencyActions: ['PROBE_REFRESH'],
    minConfidence: 'PROBABLE',
    limits: {
        max_targets: 1,
        max_concurrent_actions: 1,
        max_traffic_percentage: 5,
        max_provider_changes: 1,
        max_route_changes: 1,
        max_action_duration: 30_000,
        max_actions_per_minute: 2,
        max_actions_per_hour: 10,
        max_rollbacks: 1,
        max_failures: 3,
    },
    cooldownMs: 30_000,
    canaryPercentage: 1,
    version: 'phase26.v1',
});
export const autopilotTransitions = {
    IDLE: ['OBSERVING', 'CANCELLED'],
    OBSERVING: ['MEASURING', 'CANCELLED', 'FAILED'],
    MEASURING: ['DETECTED', 'SUCCEEDED', 'FAILED'],
    DETECTED: ['DIAGNOSING', 'RECOVERING', 'FAILED'],
    DIAGNOSING: ['DECIDING', 'ESCALATED', 'FAILED'],
    DECIDING: ['POLICY_CHECK', 'BLOCKED', 'FAILED'],
    POLICY_CHECK: ['PLANNING', 'BLOCKED', 'ESCALATED', 'FAILED'],
    PLANNING: ['READY_TO_APPLY', 'BLOCKED', 'FAILED'],
    READY_TO_APPLY: ['APPLYING', 'SUCCEEDED', 'BLOCKED', 'CANCELLED'],
    APPLYING: ['VERIFYING', 'ROLLBACK_REQUIRED', 'FAILED'],
    VERIFYING: ['SUCCEEDED', 'ROLLBACK_REQUIRED', 'RECOVERED', 'ESCALATED', 'FAILED'],
    SUCCEEDED: [],
    ROLLBACK_REQUIRED: ['ROLLING_BACK', 'ESCALATED'],
    ROLLING_BACK: ['RECOVERING', 'ESCALATED', 'FAILED'],
    RECOVERING: ['RECOVERED', 'ESCALATED', 'FAILED'],
    RECOVERED: [],
    FAILED: [],
    ESCALATED: [],
    CANCELLED: [],
    BLOCKED: [],
};
export class AutopilotStateMachine {
    state;
    constructor(state = 'IDLE') {
        this.state = state;
    }
    current() {
        return this.state;
    }
    transition(to) {
        if (!autopilotTransitions[this.state].includes(to))
            throw new Error(`Invalid autopilot transition ${this.state} -> ${to}`);
        this.state = to;
        return this.state;
    }
}
export class ActionCatalog {
    actions = new Map();
    constructor() {
        this.register('DNS_SWITCH', 'Switch DNS provider', 'dns switch verified', 'restore previous DNS provider', 'dns.write', 'MEDIUM', true);
        this.register('DNS_RESTORE', 'Restore DNS provider', 'dns restore verified', 'no-op after restore', 'dns.write', 'LOW', true);
        this.register('PROBE_REFRESH', 'Refresh probes', 'fresh probe telemetry', 'no rollback required', 'runtime.simulate', 'LOW', false);
        this.register('CACHE_REFRESH', 'Refresh cache', 'cache refreshed', 'no rollback required', 'runtime.simulate', 'LOW', false);
    }
    register(type, expected, verify, rollback, policy, risk, consequential) {
        this.actions.set(type, {
            action_type: type,
            preconditions: ['target exists', 'policy authorized'],
            expected_effect: expected,
            timeoutMs: 30_000,
            retry_policy: 'bounded',
            maximum_retries: 1,
            cooldownMs: 30_000,
            blast_radius: {
                targets: [],
                dependencies: [],
                trafficPercentage: 0,
                providers: [],
                routes: [],
            },
            verification_strategy: verify,
            rollback_strategy: rollback,
            required_policy: policy,
            risk_level: risk,
            idempotent: true,
            consequential,
        });
    }
    create(type, target, parameters, ids) {
        const spec = this.actions.get(type);
        if (!spec)
            throw new ActionValidationError(`Unknown action ${type}`);
        return deepFreeze({
            ...spec,
            action_id: ids.action_id,
            target,
            parameters,
            idempotency_key: stableId('idem', `${ids.incident_id}:${type}:${target}:${JSON.stringify(parameters)}`),
            blast_radius: {
                ...spec.blast_radius,
                targets: [target],
                providers: type.includes('DNS') ? [target] : [],
                trafficPercentage: type === 'DNS_SWITCH' ? 5 : 0,
            },
        });
    }
    list() {
        return [...this.actions.keys()].sort();
    }
}
export class AutopilotDomainError extends Error {
}
export class PolicyDeniedError extends AutopilotDomainError {
}
export class SafetyGateError extends AutopilotDomainError {
}
export class ActionValidationError extends AutopilotDomainError {
}
export class ActionConflictError extends AutopilotDomainError {
}
export class CircuitBreakerOpenError extends AutopilotDomainError {
}
class CircuitBreaker {
    state = 'CLOSED';
    failures = 0;
    rollbacks = 0;
    recordFailure(limit) {
        this.failures++;
        if (this.failures >= limit)
            this.state = 'OPEN';
    }
    recordRollback(limit) {
        this.rollbacks++;
        if (this.rollbacks > limit)
            this.state = 'OPEN';
    }
    reset() {
        this.state = 'CLOSED';
        this.failures = 0;
        this.rollbacks = 0;
    }
}
class LockManager {
    locks = new Set();
    acquire(key) {
        if (this.locks.has(key))
            throw new ActionConflictError(`conflicting action lock ${key}`);
        this.locks.add(key);
        return () => this.locks.delete(key);
    }
}
/**
 * Historical compatibility model retained for replay/fixture consumers.
 *
 * @deprecated Use ResilienceRuntime (and BoundedClosedLoopController when
 * bounded repetition is required). This model is not a privileged execution
 * authority and production clients must project canonical runtime records.
 */
export class NetworkAutopilot {
    providers;
    policy;
    events;
    telemetry;
    catalog = new ActionCatalog();
    breaker = new CircuitBreaker();
    locks = new LockManager();
    runs = new Map();
    idempotency = new Map();
    actionTimestamps = [];
    constructor(providers = [], policy = defaultAutopilotPolicy(), options = {}) {
        this.providers = providers;
        this.policy = policy;
        this.events = options.events ?? new InMemoryEventSink();
        this.telemetry = options.telemetry ?? new InMemoryTelemetrySink();
    }
    status() {
        return {
            enabled: this.policy.enabled,
            mode: this.policy.mode,
            circuitBreaker: this.breaker.state,
            activeRuns: [...this.runs.values()].filter((r) => !['SUCCEEDED', 'RECOVERED', 'FAILED', 'ESCALATED', 'BLOCKED', 'CANCELLED'].includes(r.state)).length,
            policyVersion: this.policy.version,
        };
    }
    listRuns() {
        return [...this.runs.values()];
    }
    getRun(id) {
        return this.runs.get(id);
    }
    actions() {
        return this.catalog.list();
    }
    policies() {
        return this.policy;
    }
    resetCircuitBreaker() {
        this.breaker.reset();
    }
    async run(input = {}) {
        const start = Date.now();
        const ids = {
            autopilot_run_id: nextId('autopilot_run'),
            incident_id: nextId('incident'),
            decision_id: nextId('decision'),
            action_id: nextId('action'),
            verification_id: nextId('verification'),
            rollback_id: nextId('rollback'),
            trace_id: nextId('trace'),
        };
        const sm = new AutopilotStateMachine();
        let run = {
            autopilot_run_id: ids.autopilot_run_id,
            incident_id: ids.incident_id,
            trace_id: ids.trace_id,
            state: sm.current(),
            createdAt: nowIso(),
            updatedAt: nowIso(),
            mode: input.mode ?? this.policy.mode,
            events: [],
        };
        const save = async (event, patch = {}) => {
            run = deepFreeze({
                ...run,
                ...patch,
                state: sm.current(),
                updatedAt: nowIso(),
                events: [...run.events, event],
            });
            this.runs.set(run.autopilot_run_id, run);
            await this.events.emit(event, { ...ids, state: run.state });
        };
        await save('autopilot.run.created');
        try {
            sm.transition('OBSERVING');
            const context = createRuntimeContext({
                mode: 'simulation',
                correlationId: ids.trace_id,
                ...input.context,
            });
            const batch = await new ObservationAggregator(this.providers).collect(context);
            const observation = {
                id: nextId('autopilot_observation'),
                timestamp: nowIso(),
                subject: 'network',
                signals: batch.observations.map((o) => o.metric),
                batch,
                correlation: ids,
            };
            await save('autopilot.observation.created', { observation });
            sm.transition('MEASURING');
            const measurement = this.measure(batch, ids);
            await save('autopilot.measurement.created', { measurement });
            const recovered = measurement.health === 'healthy';
            if (recovered) {
                sm.transition('SUCCEEDED');
                const outcome = {
                    status: 'NOOP',
                    durationMs: Date.now() - start,
                    metricsBefore: measurement,
                    metricsAfter: measurement,
                    correlation: ids,
                };
                await save('autopilot.run.completed', { outcome });
                return run;
            }
            sm.transition('DETECTED');
            const detection = {
                id: nextId('autopilot_detection'),
                kind: measurement.health === 'critical' ? 'threshold' : 'degradation',
                detected: true,
                severity: measurement.health,
                evidence: batch.observations.map((o) => o.id),
                cooldownActive: false,
                correlation: ids,
            };
            await save('autopilot.detection.created', { detection });
            sm.transition('DIAGNOSING');
            const diagnosis = await this.diagnose(batch, context, ids);
            await save('autopilot.diagnosis.created', { diagnosis });
            if (diagnosis.confidence === 'UNKNOWN') {
                sm.transition('ESCALATED');
                const outcome = {
                    status: 'ESCALATED',
                    durationMs: Date.now() - start,
                    metricsBefore: measurement,
                    correlation: ids,
                };
                await save('autopilot.run.escalated', { outcome });
                return run;
            }
            sm.transition('DECIDING');
            const decision = this.decide(measurement, diagnosis, ids);
            await save('autopilot.decision.created', { decision });
            sm.transition('POLICY_CHECK');
            const policyEval = this.evaluate(decision.selected_action, diagnosis, run.mode, ids);
            await save('autopilot.policy.evaluated', { policyEvaluation: policyEval });
            if (policyEval.outcome === 'DENY' ||
                policyEval.outcome === 'UNKNOWN' ||
                policyEval.outcome === 'REQUIRE_APPROVAL') {
                sm.transition(policyEval.outcome === 'REQUIRE_APPROVAL' ? 'BLOCKED' : 'ESCALATED');
                const outcome = {
                    status: policyEval.outcome === 'REQUIRE_APPROVAL'
                        ? 'BLOCKED'
                        : 'ESCALATED',
                    durationMs: Date.now() - start,
                    metricsBefore: measurement,
                    correlation: ids,
                };
                await save(run.state === 'BLOCKED' ? 'autopilot.run.blocked' : 'autopilot.run.escalated', {
                    outcome,
                });
                return run;
            }
            sm.transition('PLANNING');
            const plan = {
                id: nextId('autopilot_plan'),
                ...(decision.selected_action ? { action: decision.selected_action } : {}),
                canary: run.mode === 'CANARY',
                dryRun: Boolean(input.dryRun),
                shadow: Boolean(input.shadow || run.mode === 'ADVISORY' || run.mode === 'OBSERVE_ONLY'),
                steps: [
                    'capture pre-action snapshot',
                    'apply typed action',
                    'verify postconditions',
                    'rollback on verification failure',
                ],
                policy: policyEval,
                correlation: ids,
            };
            await save('autopilot.plan.created', { plan });
            sm.transition('READY_TO_APPLY');
            if (plan.dryRun || plan.shadow || !plan.action) {
                sm.transition('SUCCEEDED');
                const outcome = {
                    status: plan.dryRun
                        ? 'DRY_RUN'
                        : plan.shadow
                            ? 'SHADOW'
                            : 'NOOP',
                    durationMs: Date.now() - start,
                    metricsBefore: measurement,
                    correlation: ids,
                };
                await save('autopilot.run.completed', { outcome });
                return run;
            }
            sm.transition('APPLYING');
            await save('autopilot.action.started');
            const actionResult = await this.apply(plan.action, measurement);
            await save('autopilot.action.completed', { actionResult });
            sm.transition('VERIFYING');
            await save('autopilot.verification.started');
            const after = {
                ...measurement,
                id: nextId('autopilot_measurement'),
                health: input.forceVerificationFailure ? 'critical' : 'healthy',
                metrics: { ...measurement.metrics, simulated_remediated: !input.forceVerificationFailure },
            };
            const verification = {
                verification_id: ids.verification_id,
                status: input.forceVerificationFailure ? 'FAIL' : 'PASS',
                before: measurement,
                after,
                improved: !input.forceVerificationFailure,
                evidence: [plan.action.verification_strategy],
                correlation: ids,
            };
            await save('autopilot.verification.completed', { verification });
            if (verification.status === 'PASS') {
                sm.transition('SUCCEEDED');
                const outcome = {
                    status: 'SUCCESS',
                    durationMs: Date.now() - start,
                    metricsBefore: measurement,
                    metricsAfter: after,
                    correlation: ids,
                };
                await save('autopilot.run.completed', { outcome });
                return run;
            }
            sm.transition('ROLLBACK_REQUIRED');
            sm.transition('ROLLING_BACK');
            await save('autopilot.rollback.started');
            const rollback = {
                rollback_id: ids.rollback_id,
                action_id: plan.action.action_id,
                status: 'COMPLETED',
                ...(actionResult.before_state ? { snapshot: actionResult.before_state } : {}),
                reason: 'verification did not prove healthy state',
                correlation: ids,
            };
            this.breaker.recordRollback(this.policy.limits.max_rollbacks);
            await save('autopilot.rollback.completed', { rollback });
            sm.transition('RECOVERING');
            const recovery = {
                id: nextId('autopilot_recovery'),
                status: 'RECOVERED',
                verification: 'PASS',
                correlation: ids,
            };
            sm.transition('RECOVERED');
            const outcome = {
                status: 'ROLLED_BACK',
                durationMs: Date.now() - start,
                metricsBefore: measurement,
                metricsAfter: measurement,
                correlation: ids,
            };
            await save('autopilot.recovery.completed', { recovery, outcome });
            return run;
        }
        catch (e) {
            this.breaker.recordFailure(this.policy.limits.max_failures);
            if (this.breaker.state === 'OPEN')
                await this.events.emit('autopilot.circuit_breaker.opened', { ...ids, error: String(e) });
            throw e;
        }
    }
    measure(batch, ids) {
        const worst = batch.observations.some((o) => o.status === 'failed')
            ? 'critical'
            : batch.observations.some((o) => o.status === 'degraded' || o.status === 'stale')
                ? 'degraded'
                : batch.observations.length
                    ? 'healthy'
                    : 'unknown';
        return {
            id: nextId('autopilot_measurement'),
            timestamp: nowIso(),
            subject: 'network',
            metrics: {
                count: batch.observations.length,
                failed: batch.observations.filter((o) => o.status === 'failed').length,
                degraded: batch.observations.filter((o) => o.status === 'degraded').length,
            },
            baseline: { expected: 'healthy' },
            deviation: { status: worst },
            confidence: batch.minConfidence,
            freshnessMs: Math.max(0, ...batch.observations.map((o) => o.freshnessMs)),
            source: 'resilience-runtime.observation',
            health: worst,
            correlation: ids,
        };
    }
    async diagnose(batch, context, ids) {
        const incidents = await new IncidentCorrelator().correlate(batch, context);
        const conf = batch.minConfidence >= 0.8
            ? 'CONFIDENT'
            : batch.minConfidence >= 0.6
                ? 'PROBABLE'
                : batch.minConfidence > 0
                    ? 'POSSIBLE'
                    : 'UNKNOWN';
        const roots = incidents.map((i) => i.rootCause);
        return {
            id: nextId('autopilot_diagnosis'),
            root_cause_candidates: roots.length ? roots : ['unknown'],
            evidence: incidents.flatMap((i) => i.evidence),
            confidence: conf,
            affected_components: [...new Set(incidents.flatMap((i) => i.affectedComponents))],
            affected_paths: [],
            affected_providers: roots.some((r) => r.includes('dns')) ? ['dns'] : [],
            recommended_actions: roots.some((r) => r.includes('dns'))
                ? ['DNS_SWITCH']
                : ['PROBE_REFRESH'],
            risk: roots.some((r) => r.includes('security')) ? 'HIGH' : 'LOW',
            correlation: ids,
        };
    }
    decide(measurement, diagnosis, ids) {
        const type = diagnosis.recommended_actions[0] ?? 'PROBE_REFRESH';
        const action = this.catalog.create(type, diagnosis.affected_providers[0] ?? 'local-simulator', { reason: diagnosis.root_cause_candidates[0] ?? 'unknown' }, ids);
        return {
            decision_id: ids.decision_id,
            input_snapshot: measurement,
            diagnosis,
            candidate_actions: [action],
            selected_action: action,
            reason: `selected ${type} deterministically from diagnosis`,
            confidence: diagnosis.confidence,
            expected_effect: action.expected_effect,
            risk: action.risk_level,
            rollback_strategy: action.rollback_strategy,
            replay: {
                policyVersion: this.policy.version,
                decisionVersion: 'phase26.v1',
                actionCatalogVersion: 'phase26.v1',
                configurationVersion: this.policy.version,
            },
        };
    }
    evaluate(action, diagnosis, mode, ids) {
        const gates = [
            ['identity', true, 'autopilot service identity'],
            ['authorization', true, 'typed internal action authorization'],
            [
                'policy',
                Boolean(action && this.policy.allowedActions.includes(action.action_type)),
                'action must be allowlisted',
            ],
            ['confidence', diagnosis.confidence !== 'UNKNOWN', 'unknown confidence fails closed'],
            ['target validity', Boolean(action?.target), 'target required'],
            ['preconditions', Boolean(action?.preconditions.length), 'preconditions declared'],
            [
                'blast radius',
                Boolean(action &&
                    action.blast_radius.targets.length <= this.policy.limits.max_targets &&
                    action.blast_radius.trafficPercentage <= this.policy.limits.max_traffic_percentage),
                'within configured blast radius',
            ],
            ['cooldown', true, 'cooldown satisfied'],
            ['rate limit', this.withinBudget(), 'action budget available'],
            [
                'action budget',
                this.actionTimestamps.length < this.policy.limits.max_actions_per_hour,
                'hourly budget available',
            ],
            ['retry budget', Boolean(action && action.maximum_retries <= 1), 'bounded retries'],
            [
                'rollback availability',
                Boolean(!action?.consequential || action.rollback_strategy),
                'rollback declared',
            ],
            ['system health', this.breaker.state !== 'OPEN', 'circuit breaker closed'],
            ['dependency health', true, 'local simulator dependency available'],
        ];
        const safety_gates = gates.map(([name, passed, reason]) => ({ name, passed, reason }));
        let outcome = 'ALLOW';
        const reasons = safety_gates.filter((g) => !g.passed).map((g) => g.name);
        if (!this.policy.enabled || mode === 'OBSERVE_ONLY' || mode === 'ADVISORY')
            outcome = 'REQUIRE_APPROVAL';
        else if (mode === 'APPROVAL_REQUIRED')
            outcome = 'REQUIRE_APPROVAL';
        else if (mode === 'EMERGENCY' &&
            action &&
            !this.policy.emergencyActions.includes(action.action_type))
            outcome = 'DENY';
        else if (reasons.length)
            outcome = 'DENY';
        else if (mode === 'CANARY')
            outcome = 'ALLOW_WITH_LIMITS';
        return {
            id: nextId('autopilot_policy'),
            outcome,
            reasons,
            safety_gates,
            limits: this.policy.limits,
            correlation: ids,
        };
    }
    withinBudget() {
        const now = Date.now();
        this.actionTimestamps = this.actionTimestamps.filter((t) => now - t < 3_600_000);
        return (this.actionTimestamps.filter((t) => now - t < 60_000).length <
            this.policy.limits.max_actions_per_minute);
    }
    async apply(action, before) {
        if (this.breaker.state === 'OPEN')
            throw new CircuitBreakerOpenError('circuit breaker is open');
        if (this.idempotency.has(action.idempotency_key))
            return { ...this.idempotency.get(action.idempotency_key), status: 'DUPLICATE' };
        const release = this.locks.acquire(`${action.action_type}:${action.target}`);
        const started = Date.now();
        try {
            const snapshot = {
                target: action.target,
                current_state: { provider: 'system-default' },
                configuration: action.parameters,
                health: before.health,
                route_provider_state: {
                    providers: action.blast_radius.providers,
                    routes: action.blast_radius.routes,
                },
                relevant_metrics: before.metrics,
                timestamp: nowIso(),
                version: 'phase26.v1',
                checksum: stableId('snapshot', JSON.stringify(before.metrics)),
            };
            const result = {
                status: 'SUCCESS',
                started_at: new Date(started).toISOString(),
                completed_at: nowIso(),
                durationMs: Date.now() - started,
                target: action.target,
                changed: action.consequential,
                before_state: snapshot,
                after_state: { applied: action.action_type, target: action.target },
                retry_count: 0,
            };
            this.idempotency.set(action.idempotency_key, result);
            this.actionTimestamps.push(Date.now());
            this.telemetry.increment('autopilot_actions_total');
            this.telemetry.observe('autopilot_action_duration', result.durationMs);
            return result;
        }
        finally {
            release();
        }
    }
}
export const createAutopilotPolicy = (overlay = {}) => ({
    ...defaultAutopilotPolicy(),
    ...overlay,
    limits: { ...defaultAutopilotPolicy().limits, ...(overlay.limits ?? {}) },
});
//# sourceMappingURL=autopilot.js.map