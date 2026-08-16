import { createRuntimeContext } from './context/context.js';
import type {
  RuntimeContext,
  RuntimeSnapshot,
  RuntimeCounters,
  DecisionOutcome,
} from './domain/types.js';
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
import { InMemoryTelemetrySink } from './telemetry/telemetry.js';
import type { ObservationProvider } from './ports/ports.js';
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
  readonly telemetry = new InMemoryTelemetrySink();
  readonly decisions = new InMemoryDecisionStore();
  readonly incidents = new InMemoryIncidentStore();
  readonly state = new RuntimeStateMachine('idle', this.events);
  private last?: Awaited<ReturnType<typeof createDecisionRecord>>;
  constructor(private readonly providers: readonly ObservationProvider[] = []) {}
  async cycle(
    input: Partial<RuntimeContext> = {},
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
    const candidates = await new SubsystemDecisionAdapter().decide(found, context);
    const plan = await new DeterministicPlanner().plan(candidates, context);
    await this.events.emit('runtime.plan.created', {
      correlationId: context.correlationId,
      planId: plan.id,
    });
    if (!plan.policyResult.allowed) {
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
        outcome: 'blocked',
        confidence: plan.confidence,
        durationMs: Date.now() - start,
      });
      await this.decisions.put(record);
      this.last = record;
      return record;
    }
    await this.state.transition('validating', context.correlationId);
    const validation = await new RuntimeActionValidator().validate(plan, context);
    if (!validation.valid) {
      await this.state.transition('blocked', context.correlationId);
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
      return record;
    }
    let outcome: DecisionOutcome = 'simulated';
    let execution;
    let verification;
    let recovery;
    if (context.mode === 'simulation') {
      await this.state.transition('observing', context.correlationId);
    } else {
      await this.state.transition('executing', context.correlationId);
      execution = await new CoordinatedActionExecutor().execute(plan, context);
      await this.events.emit('runtime.execution.completed', {
        correlationId: context.correlationId,
        status: execution.status,
      });
      await this.state.transition('verifying', context.correlationId);
      verification = await new RuntimeActionVerifier().verify(plan, execution, context);
      await this.events.emit('runtime.verification.completed', {
        correlationId: context.correlationId,
        status: verification.status,
      });
      if (verification.status === 'failed') {
        await this.state.transition('recovering', context.correlationId);
        recovery = await new FailoverRecoveryProvider().recover(
          plan,
          'verification failed',
          context,
        );
        outcome = recovery.status === 'success' ? 'recovered' : 'degraded';
        await this.state.transition(
          recovery.status === 'success' ? 'verifying' : 'degraded',
          context.correlationId,
        );
      } else outcome = execution.simulated ? 'simulated' : 'success';
      if (this.state.current() === 'verifying')
        await this.state.transition('observing', context.correlationId);
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
    this.counters = { ...this.counters, decisionsTotal: this.counters.decisionsTotal + 1 };
    this.telemetry.increment('runtime_cycles_total');
    this.telemetry.increment('runtime_decisions_total');
    this.telemetry.observe('runtime_cycle_duration', record.durationMs);
    this.telemetry.observe('runtime_decision_confidence', record.confidence);
    await this.events.emit('runtime.decision.recorded', {
      correlationId: context.correlationId,
      decisionId: record.decisionId,
    });
    return record;
  }
  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const lastIncidents = await this.incidents.list();
    return {
      state: this.state.current(),
      activeIncident: lastIncidents.at(-1),
      recentObservations: this.last?.observations,
      policySnapshot: this.last?.runtimeContext
        ? createRuntimeContext({ mode: this.last.runtimeContext.mode }).policySnapshot
        : createRuntimeContext().policySnapshot,
      currentPlan: this.last?.selectedPlan,
      currentAction: this.last?.selectedPlan?.selectedAction,
      verificationStatus: this.last?.verificationResult,
      recoveryStatus: this.last?.recoveryResult,
      lastDecision: this.last,
      health: {
        status: this.state.current() === 'failed' ? 'failed' : this.last ? 'healthy' : 'unknown',
        reason: this.last ? 'last cycle recorded' : 'no evidence yet',
      },
      uptimeMs: Date.now() - this.started,
      counters: this.counters,
      mode: this.last?.runtimeContext.mode ?? 'safe',
    };
  }
}
