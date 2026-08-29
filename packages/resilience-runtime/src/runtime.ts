import { createRuntimeContext } from './context/context.js';
import type { RuntimeContext, RuntimeSnapshot, RuntimeCounters, DecisionOutcome } from './domain/types.js';
import { RuntimeStateMachine } from './state/state-machine.js';
import { ObservationAggregator } from './observations/observations.js';
import { IncidentCorrelator } from './incidents/incidents.js';
import { SubsystemDecisionAdapter } from './adapters/adapters.js';
import { DeterministicPlanner } from './planning/planner.js';
import { RuntimeActionValidator } from './validation/validation.js';
import { CoordinatedActionExecutor } from './execution/execution.js';
import { RuntimeActionVerifier } from './verification/verification.js';
import { FailoverRecoveryProvider } from './recovery/recovery.js';
import { createDecisionRecord } from './decisions/records.js';
import { InMemoryDecisionStore, InMemoryIncidentStore } from './stores/memory.js';
import { InMemoryEventSink } from './events/events.js';
import { createDefaultRuntimeAdapterRegistry, type RuntimeAdapterRegistry } from './adapter-registry.js';
import { InMemoryTelemetrySink } from './telemetry/telemetry.js';
import type { ObservationProvider } from './ports/ports.js';

export class ResilienceRuntime {
  private readonly started = Date.now();
  private counters: RuntimeCounters = { cyclesTotal: 0, cyclesFailedTotal: 0, decisionsTotal: 0, actionsTotal: 0, actionsFailedTotal: 0, verificationsFailedTotal: 0, recoveriesTotal: 0, rollbacksTotal: 0, blockedTotal: 0, degradedTotal: 0 };
  readonly events = new InMemoryEventSink();
  readonly telemetry = new InMemoryTelemetrySink();
  readonly decisions = new InMemoryDecisionStore();
  readonly incidents = new InMemoryIncidentStore();
  readonly state = new RuntimeStateMachine('idle', this.events);
  readonly runtimeId: string;
  readonly instanceId: string;
  readonly adapters: RuntimeAdapterRegistry;
  private inFlight: Promise<Awaited<ReturnType<typeof createDecisionRecord>>> | undefined;
  private idempotency = new Map<string, Awaited<ReturnType<typeof createDecisionRecord>>>();
  private last?: Awaited<ReturnType<typeof createDecisionRecord>>;

  constructor(
    private readonly providers: readonly ObservationProvider[] = [],
    options: { runtimeId?: string; instanceId?: string; adapters?: RuntimeAdapterRegistry } = {},
  ) {
    this.runtimeId = options.runtimeId ?? 'runtime-default';
    this.instanceId = options.instanceId ?? `instance-${Math.random().toString(36).slice(2)}`;
    this.adapters = options.adapters ?? createDefaultRuntimeAdapterRegistry();
  }
  capabilities() { return this.adapters.list(); }
  async runCycle(input: Partial<RuntimeContext> & { idempotencyKey?: string } = {}) { return this.cycle(input); }
  async cycle(input: Partial<RuntimeContext> & { idempotencyKey?: string } = {}) {
    if (input.idempotencyKey && this.idempotency.has(input.idempotencyKey)) return this.idempotency.get(input.idempotencyKey)!;
    if (this.inFlight) throw new Error('runtime cycle already active');
    this.inFlight = this.executeCycle(input);
    try {
      const record = await this.inFlight;
      if (input.idempotencyKey) this.idempotency.set(input.idempotencyKey, record);
      return record;
    } finally { this.inFlight = undefined; }
  }

  private async executeCycle(input: Partial<RuntimeContext> = {}): Promise<Awaited<ReturnType<typeof createDecisionRecord>>> {
    const start = Date.now();
    let context = createRuntimeContext(input);
    const before = this.state.current();
    this.counters = { ...this.counters, cyclesTotal: this.counters.cyclesTotal + 1 };
    await this.events.emit('runtime.cycle.started', { correlationId: context.correlationId });
    await this.state.transition('observing', context.correlationId);
    const observations = await new ObservationAggregator(this.providers).collect(context);
    context = createRuntimeContext({ ...context, observationSnapshot: observations });
    await this.events.emit('runtime.observation.updated', { correlationId: context.correlationId, count: observations.observations.length });
    await this.state.transition('analyzing', context.correlationId);
    const found = await new IncidentCorrelator().correlate(observations, context);
    for (const i of found) { await this.incidents.put(i); await this.events.emit('runtime.incident.detected', { correlationId: context.correlationId, incidentId: i.id }); }
    await this.state.transition('planning', context.correlationId);
    const candidates = await new SubsystemDecisionAdapter().decide(found, context);
    const plan = await new DeterministicPlanner().plan(candidates, context);
    await this.events.emit('runtime.plan.created', { correlationId: context.correlationId, planId: plan.id });

    if (!plan.policyResult.allowed) return this.recordBlocked(context, before, observations, found, candidates, plan, start);

    await this.state.transition('validating', context.correlationId);
    const validator = new RuntimeActionValidator();
    const lockKey = plan.dependencies.join('|') || plan.selectedAction.intent;
    if (!validator.lock(lockKey)) return this.recordBlocked(context, before, observations, found, candidates, plan, start, 'conflicting operation is active');
    try {
      const validation = await validator.validate(plan, context);
      if (!validation.valid) return this.recordBlocked(context, before, observations, found, candidates, plan, start, validation.reasons.join('; '), validation);

      let outcome: DecisionOutcome = 'simulated';
      let execution;
      let verification;
      let recovery;
      const executor = new CoordinatedActionExecutor(this.adapters);
      const verifier = new RuntimeActionVerifier(this.adapters);
      const recoveryProvider = new FailoverRecoveryProvider(this.adapters);

      if (context.mode === 'simulation') {
        execution = await executor.execute(plan, context);
        verification = await verifier.verify(plan, execution, context);
        outcome = 'simulated';
      } else {
        await this.state.transition('executing', context.correlationId);
        execution = await executor.execute(plan, context);
        await this.events.emit('runtime.execution.completed', { correlationId: context.correlationId, status: execution.status });
        await this.state.transition('verifying', context.correlationId);
        verification = await verifier.verify(plan, execution, context);
        await this.events.emit('runtime.verification.completed', { correlationId: context.correlationId, status: verification.status });
        if (verification.status === 'failed') {
          await this.state.transition('recovering', context.correlationId);
          recovery = await recoveryProvider.recover(plan, 'verification failed', context);
          outcome = recovery.status === 'success' ? 'recovered' : 'degraded';
          if (recovery.status === 'success') {
            await this.state.transition('verifying', context.correlationId);
            // Recovery is not considered successful until the next observation cycle.
            outcome = 'degraded';
          } else await this.state.transition('degraded', context.correlationId);
        } else outcome = execution.status === 'success' && !execution.simulated ? 'success' : 'simulated';
        if (this.state.current() === 'verifying') await this.state.transition('observing', context.correlationId);
      }
      const record = createDecisionRecord({ context, before, after: this.state.current(), observations, incidents: found, policyEvaluation: plan.policyResult, candidates, selectedPlan: plan, validation, executionResult: execution, verificationResult: verification, recoveryResult: recovery, outcome, confidence: plan.confidence, durationMs: Date.now() - start });
      await this.decisions.put(record); this.last = record;
      this.counters = { ...this.counters, decisionsTotal: this.counters.decisionsTotal + 1, actionsTotal: this.counters.actionsTotal + (execution?.status === 'success' ? 1 : 0), actionsFailedTotal: this.counters.actionsFailedTotal + (execution?.status === 'failed' ? 1 : 0), verificationsFailedTotal: this.counters.verificationsFailedTotal + (verification?.status === 'failed' ? 1 : 0), recoveriesTotal: this.counters.recoveriesTotal + (recovery ? 1 : 0), degradedTotal: this.counters.degradedTotal + (outcome === 'degraded' ? 1 : 0) };
      this.telemetry.increment('runtime_cycles_total'); this.telemetry.increment('runtime_decisions_total'); this.telemetry.observe('runtime_cycle_duration', record.durationMs); this.telemetry.observe('runtime_decision_confidence', record.confidence);
      await this.events.emit('runtime.decision.recorded', { correlationId: context.correlationId, decisionId: record.decisionId });
      return record;
    } finally { validator.release(lockKey); }
  }

  private async recordBlocked(context: RuntimeContext, before: string, observations: any, found: any, candidates: any, plan: any, start: number, reason?: string, validation?: any) {
    await this.state.transition('blocked', context.correlationId);
    this.counters = { ...this.counters, blockedTotal: this.counters.blockedTotal + 1 };
    const record = createDecisionRecord({ context, before, after: this.state.current(), observations, incidents: found, policyEvaluation: plan.policyResult, candidates, selectedPlan: plan, validation, outcome: 'blocked', confidence: plan.confidence, durationMs: Date.now() - start });
    await this.decisions.put(record); this.last = record;
    await this.events.emit('runtime.decision.recorded', { correlationId: context.correlationId, decisionId: record.decisionId });
    return record;
  }

  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const lastIncidents = await this.incidents.list();
    const state = this.state.current();
    const evidenceBacked = Boolean(this.last?.verificationResult?.status === 'success' || this.last?.outcome === 'simulated' || this.last?.outcome === 'blocked');
    return {
      state,
      activeIncident: lastIncidents.at(-1),
      recentObservations: this.last?.observations,
      policySnapshot: this.last?.runtimeContext ? createRuntimeContext({ mode: this.last.runtimeContext.mode }).policySnapshot : createRuntimeContext().policySnapshot,
      currentPlan: this.last?.selectedPlan,
      currentAction: this.last?.selectedPlan?.selectedAction,
      verificationStatus: this.last?.verificationResult,
      recoveryStatus: this.last?.recoveryResult,
      lastDecision: this.last,
      health: { status: state === 'blocked' ? 'degraded' : state === 'failed' ? 'failed' : evidenceBacked ? 'healthy' : 'unknown', reason: evidenceBacked ? 'backed by cycle evidence' : 'no verified health evidence' },
      uptimeMs: Date.now() - this.started,
      counters: this.counters,
      mode: this.last?.runtimeContext.mode ?? 'safe',
    };
  }
}
