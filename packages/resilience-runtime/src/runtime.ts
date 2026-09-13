import { createRuntimeContext } from './context/context.js';
import type {
  RuntimeContext,
  RuntimeSnapshot,
  RuntimeCounters,
  DecisionOutcome,
  RuntimeState,
  ObservationBatch,
  Incident,
  CandidateAction,
  ActionPlan,
  ActionValidation,
} from './domain/types.js';
import { RuntimeStateMachine } from './state/state-machine.js';
import { ObservationAggregator } from './observations/observations.js';
import { IncidentCorrelator } from './incidents/incidents.js';
import { DeterministicPlanner } from './planning/planner.js';
import { RuntimeActionValidator } from './validation/validation.js';
import { CoordinatedActionExecutor } from './execution/execution.js';
import { ActionTransactionEngine } from './transactions/action-transaction.js';
import { RuntimeActionVerifier } from './verification/verification.js';
import { FailoverRecoveryProvider } from './recovery/recovery.js';
import { createDecisionRecord } from './decisions/records.js';
import { InMemoryDecisionStore, InMemoryIncidentStore } from './stores/memory.js';
import { InMemoryEventSink } from './events/events.js';
import {
  createDefaultRuntimeAdapterRegistry,
  type RuntimeAdapterRegistry,
} from './adapter-registry.js';
import { ResilientTelemetrySink } from './telemetry/telemetry.js';
import type { DecisionProvider, ObservationProvider, TelemetrySink } from './ports/ports.js';
import { CanonicalDecisionProvider } from './canonical-decision-provider.js';
import { DecisionOrchestrator } from './decision-orchestration.js';
import type { CanonicalNetworkControlPlane } from './canonical-network-adapter.js';
import {
  SafetyRollbackRecoveryKernel,
  SafetyViolationError,
  type SafetyKernelOptions,
} from './safety/safety-kernel.js';
import { MetricsRegistry } from '@irp/telemetry';
import { compileNetworkIntent } from './intent/compiler.js';
import type { NetworkIntent } from '@irp/core';

const MAX_IDEMPOTENCY_ENTRIES = 1_000;

export interface ResilienceRuntimeOptions {
  runtimeId?: string;
  instanceId?: string;
  adapters?: RuntimeAdapterRegistry;
  decisionProvider?: DecisionProvider;
  networkControlPlane?: CanonicalNetworkControlPlane;
  telemetryRegistry?: MetricsRegistry;
  telemetrySink?: TelemetrySink;
  safetyKernel?: SafetyKernelOptions;
}

export class ResilienceRuntime {
  private readonly started = Date.now();
  private counters: RuntimeCounters = {
    cyclesTotal: 0,
    cyclesFailedTotal: 0,
    decisionsTotal: 0,
    actionsTotal: 0,
    actionsFailedTotal: 0,
    verificationsFailedTotal: 0,
    recoveriesTotal: 0,
    rollbacksTotal: 0,
    blockedTotal: 0,
    degradedTotal: 0,
  };
  readonly events = new InMemoryEventSink();
  readonly telemetry: TelemetrySink;
  readonly telemetryRegistry: MetricsRegistry;
  readonly decisions = new InMemoryDecisionStore();
  readonly incidents = new InMemoryIncidentStore();
  readonly state = new RuntimeStateMachine('idle', this.events);
  readonly runtimeId: string;
  readonly instanceId: string;
  readonly adapters: RuntimeAdapterRegistry;
  private readonly validator: RuntimeActionValidator;
  private readonly decisionProvider: DecisionProvider;
  private readonly decisionOrchestrator: DecisionOrchestrator;
  private readonly transactionEngine: ActionTransactionEngine;
  private readonly safetyKernel: SafetyRollbackRecoveryKernel;
  private readonly networkControlPlane: CanonicalNetworkControlPlane | undefined;
  private inFlight: Promise<Awaited<ReturnType<typeof createDecisionRecord>>> | undefined;
  private idempotency = new Map<string, Awaited<ReturnType<typeof createDecisionRecord>>>();
  private last?: Awaited<ReturnType<typeof createDecisionRecord>>;
  constructor(
    private readonly providers: readonly ObservationProvider[] = [],
    options: ResilienceRuntimeOptions = {},
  ) {
    this.runtimeId = options.runtimeId ?? 'runtime-default';
    this.instanceId = options.instanceId ?? `instance-${Math.random().toString(36).slice(2)}`;
    this.networkControlPlane = options.networkControlPlane;
    this.telemetryRegistry = options.telemetryRegistry ?? new MetricsRegistry();
    this.telemetry = new ResilientTelemetrySink(options.telemetrySink);
    this.adapters =
      options.adapters ?? createDefaultRuntimeAdapterRegistry(options.networkControlPlane);
    this.validator = new RuntimeActionValidator(undefined, this.adapters);
    this.decisionProvider = options.decisionProvider ?? new CanonicalDecisionProvider();
    this.decisionOrchestrator = new DecisionOrchestrator(this.decisionProvider);
    this.transactionEngine = new ActionTransactionEngine(
      new CoordinatedActionExecutor(this.adapters),
      this.events,
    );
    this.safetyKernel = new SafetyRollbackRecoveryKernel(
      this.transactionEngine,
      this.events,
      new FailoverRecoveryProvider(this.adapters, this.networkControlPlane),
      options.safetyKernel,
    );
  }
  capabilities() {
    return this.adapters.list();
  }
  async runCycle(input: Partial<RuntimeContext> & { idempotencyKey?: string } = {}) {
    return this.cycle(input);
  }
  async runIntent(
    intent: NetworkIntent,
    input: Partial<RuntimeContext> & { idempotencyKey?: string } = {},
  ) {
    return this.cycle({ ...input, compiledIntent: compileNetworkIntent(intent) });
  }
  async cycle(input: Partial<RuntimeContext> & { idempotencyKey?: string } = {}) {
    if (input.idempotencyKey && this.idempotency.has(input.idempotencyKey))
      return this.idempotency.get(input.idempotencyKey)!;
    if (this.inFlight) throw new Error('runtime cycle already active');
    this.inFlight = this.executeCycle(input);
    try {
      const record = await this.inFlight;
      if (input.idempotencyKey) {
        this.idempotency.set(input.idempotencyKey, record);
        while (this.idempotency.size > MAX_IDEMPOTENCY_ENTRIES)
          this.idempotency.delete(this.idempotency.keys().next().value as string);
      }
      return record;
    } catch (error) {
      this.counters = { ...this.counters, cyclesFailedTotal: this.counters.cyclesFailedTotal + 1 };
      this.telemetry.increment('runtime_cycles_failed_total');
      this.recordMetric('runtime_cycles_failed_total', this.counters.cyclesFailedTotal);
      try {
        await this.state.fail(input.correlationId ?? 'runtime');
      } catch {
        // Preserve the original failure when the state machine cannot transition.
      }
      await this.events.emit('runtime.cycle.failed', {
        correlationId: input.correlationId ?? 'runtime',
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    } finally {
      this.inFlight = undefined;
    }
  }
  private async executeCycle(
    input: Partial<RuntimeContext> & { idempotencyKey?: string } = {},
  ): Promise<Awaited<ReturnType<typeof createDecisionRecord>>> {
    const start = Date.now();
    let context = createRuntimeContext(input);
    const before = this.state.current();
    this.counters = { ...this.counters, cyclesTotal: this.counters.cyclesTotal + 1 };
    await this.events.emit('runtime.cycle.started', { correlationId: context.correlationId });
    await this.state.transition('observing', context.correlationId);
    const observations = await new ObservationAggregator(this.providers).collect(context);
    context = createRuntimeContext({ ...context, observationSnapshot: observations });
    await this.events.emit('runtime.observation.updated', {
      correlationId: context.correlationId,
      count: observations.observations.length,
    });
    await this.state.transition('analyzing', context.correlationId);
    const found = await new IncidentCorrelator().correlate(observations, context);
    for (const i of found) {
      await this.incidents.put(i);
      await this.events.emit('runtime.incident.detected', {
        correlationId: context.correlationId,
        incidentId: i.id,
      });
    }
    await this.state.transition('planning', context.correlationId);
    const orchestration = await this.decisionOrchestrator.orchestrate(found, context);
    const candidates = orchestration.candidates;
    const plan = await new DeterministicPlanner().plan(candidates, context);
    await this.events.emit('runtime.plan.created', {
      correlationId: context.correlationId,
      planId: plan.id,
      decisionReason: orchestration.reason,
    });
    if (!plan.policyResult.allowed)
      return this.recordBlocked(context, before, observations, found, candidates, plan, start);
    await this.state.transition('validating', context.correlationId);
    const lockKey = plan.dependencies.join('|') || plan.selectedAction.intent;
    try {
      const validation = await this.validator.validate(plan, context, false);
      if (!validation.valid)
        return this.recordBlocked(
          context,
          before,
          observations,
          found,
          candidates,
          plan,
          start,
          validation,
        );
      if (!this.validator.lock(lockKey))
        return this.recordBlocked(context, before, observations, found, candidates, plan, start);

      let outcome: DecisionOutcome = 'simulated';
      let execution;
      let verification;
      let recovery;
      const verifier = new RuntimeActionVerifier(this.adapters);

      if (context.mode === 'simulation') {
        outcome = 'simulated';
      } else {
        await this.state.transition('executing', context.correlationId);
        try {
          execution = (await this.safetyKernel.execute(plan, context, input.idempotencyKey)).execution;
        } catch (error) {
          if (error instanceof SafetyViolationError) {
            return this.recordBlocked(context, before, observations, found, candidates, plan, start, {
              ...validation,
              valid: false,
              reasons: [...validation.reasons, ...error.assessment.reasons],
            });
          }
          throw error;
        }
        await this.events.emit('runtime.execution.completed', {
          correlationId: context.correlationId,
          status: execution.status,
        });
        await this.state.transition('verifying', context.correlationId);
        verification = await verifier.verify(plan, execution, context);
        await this.events.emit('runtime.verification.completed', {
          correlationId: context.correlationId,
          status: verification.status,
        });
        if (verification.status === 'failed') {
          await this.state.transition('recovering', context.correlationId);
          recovery = await this.safetyKernel.recover(plan, 'verification failed', context);
          outcome = 'degraded';
          await this.state.transition('degraded', context.correlationId);
        } else
          outcome = execution.status === 'success' && !execution.simulated ? 'success' : 'simulated';
      }
      const record = createDecisionRecord({
        context,
        before,
        after: this.state.current(),
        observations,
        incidents: found,
        policyEvaluation: plan.policyResult,
        candidates,
        selectedPlan: plan,
        validation,
        executionResult: execution,
        verificationResult: verification,
        recoveryResult: recovery,
        outcome,
        confidence: plan.confidence,
        durationMs: Date.now() - start,
      });
      await this.decisions.put(record);
      this.last = record;
      this.counters = {
        ...this.counters,
        decisionsTotal: this.counters.decisionsTotal + 1,
        actionsTotal: this.counters.actionsTotal + (execution?.status === 'success' ? 1 : 0),
        actionsFailedTotal:
          this.counters.actionsFailedTotal + (execution?.status === 'failed' ? 1 : 0),
        verificationsFailedTotal:
          this.counters.verificationsFailedTotal + (verification?.status === 'failed' ? 1 : 0),
        recoveriesTotal: this.counters.recoveriesTotal + (recovery ? 1 : 0),
        degradedTotal: this.counters.degradedTotal + (outcome === 'degraded' ? 1 : 0),
      };
      this.telemetry.increment('runtime_cycles_total');
      this.telemetry.increment('runtime_decisions_total');
      this.telemetry.observe('runtime_cycle_duration', record.durationMs);
      this.telemetry.observe('runtime_decision_confidence', record.confidence);
      this.recordMetric('runtime_cycles_total', this.counters.cyclesTotal);
      this.recordMetric('runtime_decisions_total', this.counters.decisionsTotal);
      this.recordMetric('runtime_actions_total', this.counters.actionsTotal);
      this.recordMetric(
        'runtime_actions_failed_total',
        this.counters.actionsFailedTotal,
      );
      this.recordMetric(
        'runtime_verifications_failed_total',
        this.counters.verificationsFailedTotal,
      );
      this.recordMetric('runtime_recoveries_total', this.counters.recoveriesTotal);
      this.recordMetric('runtime_blocked_total', this.counters.blockedTotal);
      this.recordMetric('runtime_degraded_total', this.counters.degradedTotal);
      this.recordMetric('runtime_cycle_duration', record.durationMs);
      this.recordMetric('runtime_decision_confidence', record.confidence);
      await this.events.emit('runtime.decision.recorded', {
        correlationId: context.correlationId,
        decisionId: record.decisionId,
      });
      return record;
    } finally {
      this.validator.release(lockKey);
    }
  }
  private async recordBlocked(
    context: RuntimeContext,
    before: RuntimeState,
    observations: ObservationBatch,
    found: readonly Incident[],
    candidates: readonly CandidateAction[],
    plan: ActionPlan,
    start: number,
    validation?: ActionValidation,
  ) {
    await this.state.transition('blocked', context.correlationId);
    this.counters = { ...this.counters, blockedTotal: this.counters.blockedTotal + 1 };
    const record = createDecisionRecord({
      context,
      before,
      after: this.state.current(),
      observations,
      incidents: found,
      policyEvaluation: plan.policyResult,
      candidates,
      selectedPlan: plan,
      validation,
      outcome: 'blocked',
      confidence: plan.confidence,
      durationMs: Date.now() - start,
    });
    await this.decisions.put(record);
    this.last = record;
    this.telemetry.increment('runtime_blocked_total');
    this.recordMetric('runtime_blocked_total', this.counters.blockedTotal);
    await this.events.emit('runtime.decision.recorded', {
      correlationId: context.correlationId,
      decisionId: record.decisionId,
    });
    return record;
  }
  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const lastIncidents = await this.incidents.list();
    const state = this.state.current();
    const observations = this.last?.observations?.observations ?? [];
    const hasEvidence = observations.length > 0 || Boolean(this.last?.verificationResult);
    const observationHealthy =
      observations.length > 0 &&
      observations.every((o) => o.status === 'healthy' && o.freshnessMs >= 0);
    const verifiedHealthy = this.last?.verificationResult?.status === 'success';
    const healthStatus =
      state === 'blocked'
        ? 'degraded'
        : state === 'failed'
          ? 'failed'
          : verifiedHealthy || observationHealthy
            ? 'healthy'
            : 'unknown';
    const healthReason = verifiedHealthy
      ? 'backed by verified action evidence'
      : observationHealthy
        ? 'backed by fresh healthy observations'
        : state === 'blocked'
          ? 'runtime policy or capability blocked the cycle'
          : state === 'failed'
            ? 'runtime cycle failed'
            : hasEvidence
              ? 'no verified healthy evidence'
              : 'no evidence yet';
    return {
      state,
      activeIncident: lastIncidents.at(-1),
      recentObservations: this.last?.observations,
      // API, CLI, and cockpit consumers must observe the policy that actually
      // governed the latest decision. Recreating a default snapshot here made
      // a historical/custom rejection appear to have been made by a different
      // policy, breaking both explainability and replay semantics.
      policySnapshot:
        this.last?.runtimeContext.policySnapshot ?? createRuntimeContext().policySnapshot,
      currentPlan: this.last?.selectedPlan,
      currentAction: this.last?.selectedPlan?.selectedAction,
      verificationStatus: this.last?.verificationResult,
      recoveryStatus: this.last?.recoveryResult,
      lastDecision: this.last,
      health: { status: healthStatus, reason: healthReason },
      uptimeMs: Date.now() - this.started,
      counters: this.counters,
      mode: this.last?.runtimeContext.mode ?? 'safe',
    };
  }

  private recordMetric(name: string, value: number): void {
    try {
      this.telemetryRegistry.record(name, value);
    } catch {
      this.telemetry.increment('runtime_telemetry_failures_total');
    }
  }
}
