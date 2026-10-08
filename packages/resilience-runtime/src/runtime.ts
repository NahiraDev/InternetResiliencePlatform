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
  CompiledIntent,
  ActionPlan,
  ActionValidation,
  ActionExecution,
} from './domain/types.js';
import { nextId, nowIso } from './domain/ids.js';
import { RuntimeStateMachine } from './state/state-machine.js';
import { ObservationAggregator } from './observations/observations.js';
import { IncidentCorrelator } from './incidents/incidents.js';
import { DeterministicPlanner } from './planning/planner.js';
import { RuntimeActionValidator } from './validation/validation.js';
import { CoordinatedActionExecutor } from './execution/execution.js';
import { ActionTransactionEngine } from './transactions/action-transaction.js';
import { PrivilegedMutationBoundary, createPrivilegedMutationBoundary } from './transactions/privileged-boundary.js';
import { RuntimeActionVerifier } from './verification/verification.js';
import { FailoverRecoveryProvider } from './recovery/recovery.js';
import { createDecisionRecord } from './decisions/records.js';
import { InMemoryDecisionStore, InMemoryIncidentStore } from './stores/memory.js';
import {
  EvidencePreservingEventSink,
  type EvidenceExporter,
} from './events/evidence-sink.js';
import { KnowledgeStore } from './knowledge/knowledge-store.js';
import { knowledgeEvidenceFunction } from './knowledge/knowledge-influence.js';
import { defaultEvidenceFor } from './planning/objectives.js';
import {
  createDefaultRuntimeAdapterRegistry,
  type RuntimeAdapterRegistry,
} from './adapter-registry.js';
import { ClassifiedTelemetrySink } from './events/evidence-sink.js';
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
import { RuntimePolicyArbitrator } from './policy/policy.js';
import { OutcomeLearningLoop } from './learning/outcome-learning-loop.js';
import { verifyOutcome, type OutcomeProbe } from './verification/outcome-verification.js';
import { ACTION_CLASS } from './intent/arbitration.js';
import type { IntentStore } from './intent/arbitration.js';
import type { NetworkIntent } from '@irp/core';

const MAX_IDEMPOTENCY_ENTRIES = 1_000;
// capabilitySnapshot is carried by RuntimeContext and evaluated by policy/validation before actions.

export interface ResilienceRuntimeOptions {
  runtimeId?: string;
  instanceId?: string;
  adapters?: RuntimeAdapterRegistry;
  decisionProvider?: DecisionProvider;
  networkControlPlane?: CanonicalNetworkControlPlane;
  telemetryRegistry?: MetricsRegistry;
  telemetrySink?: TelemetrySink;
  /**
   * Optional external evidence exporter. Failures never block local control;
   * the canonical runtime retains evidence locally regardless.
   */
  eventExporter?: EvidenceExporter;
  safetyKernel?: SafetyKernelOptions;
  intentStore?: IntentStore;
  /** Canonical knowledge boundary for outcome-driven ranking. */
  knowledgeStore?: KnowledgeStore;
  /**
   * Canonical outcome learning loop. Defaults to a loop bound to the runtime's
   * knowledge store, so the learning closure is never orphaned.
   */
  learningLoop?: OutcomeLearningLoop;
  /**
   * Real destination/service/application probes used to verify mutation
   * outcomes. Learning is activated only from these probes: with no probes the
   * outcome is recorded as unverified evidence and strategy selection is
   * unchanged (issue #279 task 10).
   */
  outcomeProbes?: readonly OutcomeProbe[];
  /**
   * Capabilities actually granted to the runtime actor, resolved from policy
   * (not derived from the plan's requirements). When omitted, the runtime actor
   * is denied all privileged mutation capabilities — the capability check fails
   * closed rather than granting whatever the plan happens to require.
   */
  actorCapabilities?: readonly string[];
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
  /**
   * Authoritative local evidence log. The optional external exporter is
   * best-effort: a collector failure is counted and swallowed so it can never
   * disable safe local control (issue #281).
   */
  readonly events: EvidencePreservingEventSink;
  readonly telemetry: TelemetrySink;
  readonly telemetryRegistry: MetricsRegistry;
  readonly decisions = new InMemoryDecisionStore();
  readonly incidents = new InMemoryIncidentStore();
  /**
   * Assigned in the constructor: it depends on `events`, which itself depends
   * on constructor options, so a field initializer would run too early.
   */
  readonly state: RuntimeStateMachine;
  readonly runtimeId: string;
  readonly instanceId: string;
  readonly adapters: RuntimeAdapterRegistry;
  private readonly validator: RuntimeActionValidator;
  private readonly decisionProvider: DecisionProvider;
  private readonly decisionOrchestrator: DecisionOrchestrator;
  private readonly transactionEngine: ActionTransactionEngine;
  private readonly mutationBoundary: PrivilegedMutationBoundary;
  readonly knowledgeStore: KnowledgeStore | undefined;
  readonly learningLoop: OutcomeLearningLoop;
  readonly outcomeProbes: readonly OutcomeProbe[];
  readonly actorCapabilities: readonly string[];
  private readonly safetyKernel: SafetyRollbackRecoveryKernel;
  private readonly networkControlPlane: CanonicalNetworkControlPlane | undefined;
  private readonly policyArbitrator: RuntimePolicyArbitrator;
  private inFlight: Promise<Awaited<ReturnType<typeof createDecisionRecord>>> | undefined;
  private idempotency = new Map<string, Awaited<ReturnType<typeof createDecisionRecord>>>();
  private last?: Awaited<ReturnType<typeof createDecisionRecord>>;
  constructor(
    private readonly providers: readonly ObservationProvider[] = [],
    options: ResilienceRuntimeOptions = {},
  ) {
    this.runtimeId = options.runtimeId ?? 'runtime-default';
    this.telemetry = new ClassifiedTelemetrySink(options.telemetrySink);
    this.events = new EvidencePreservingEventSink({
      ...(options.eventExporter !== undefined ? { external: options.eventExporter } : {}),
      telemetry: this.telemetry,
    });
    this.instanceId = options.instanceId ?? `instance-${Math.random().toString(36).slice(2)}`;
    this.networkControlPlane = options.networkControlPlane;
    this.telemetryRegistry = options.telemetryRegistry ?? new MetricsRegistry();
    this.state = new RuntimeStateMachine('idle', this.events);
    this.adapters =
      options.adapters ?? createDefaultRuntimeAdapterRegistry(options.networkControlPlane);
    this.validator = new RuntimeActionValidator(undefined, this.adapters);
    this.decisionProvider = options.decisionProvider ?? new CanonicalDecisionProvider();
    this.decisionOrchestrator = new DecisionOrchestrator(this.decisionProvider);
    // One policy authority for the cycle and for the privileged boundary, so the
    // boundary cannot resolve policy through a second engine.
    this.policyArbitrator = new RuntimePolicyArbitrator(options.intentStore);
    this.transactionEngine = new ActionTransactionEngine(
      new CoordinatedActionExecutor(this.adapters),
      this.events,
    );

    // PrivilegedMutationBoundary ports wired to existing components
    this.safetyKernel = new SafetyRollbackRecoveryKernel(
      this.events,
      new FailoverRecoveryProvider(this.adapters, this.networkControlPlane),
      options.safetyKernel,
    );
    this.mutationBoundary = createPrivilegedMutationBoundary({
      executor: new CoordinatedActionExecutor(this.adapters),
      events: this.events,
      safetyKernel: this.safetyKernel,
      validator: this.validator,
      adapters: this.adapters,
      policyArbitrator: this.policyArbitrator,
    });
    this.knowledgeStore = options.knowledgeStore;
    // The learning loop is never optional: an unprovided loop is created bound
    // to this runtime's knowledge store, so outcome evidence always reaches a
    // canonical owner instead of a caller-held object.
    this.learningLoop =
      options.learningLoop ??
      new OutcomeLearningLoop(
        this.knowledgeStore !== undefined ? { knowledgeStore: this.knowledgeStore } : {},
      );
    this.outcomeProbes = options.outcomeProbes ?? [];
    this.actorCapabilities = options.actorCapabilities ?? [];
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
    const compiled = compileNetworkIntent(intent);
    return this.cycle({ ...input, compiledIntent: compiled, compiledIntents: [compiled] });
  }

  async runIntents(
    intents: readonly NetworkIntent[],
    input: Partial<RuntimeContext> & { idempotencyKey?: string } = {},
  ) {
    const compiledIntents = intents.map((intent) => compileNetworkIntent(intent));
    return this.cycle({
      ...input,
      compiledIntent: compiledIntents[0],
      compiledIntents,
    });
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
    await this.state.transition('arbitrating', context.correlationId);
    const { ordered, conflicts, persistenceDegraded } =
      await this.policyArbitrator.resolveIntentConflicts(context);
    if (conflicts.length > 0) {
      await this.events.emit('runtime.arbitration.conflict', {
        correlationId: context.correlationId,
        conflicts: conflicts.map((c) => ({
          intentA: c.intentA.intentId,
          intentB: c.intentB.intentId,
          reason: c.reason,
          resolution: c.resolution,
        })),
        // Durable journal status travels with the event so a reader can tell a
        // resolved conflict from one that could not be recorded remotely.
        persistenceDegraded,
      });
      if (persistenceDegraded) {
        // Local arbitration is still authoritative; only durability is reduced.
        this.counters = {
          ...this.counters,
          degradedTotal: this.counters.degradedTotal + 1,
        };
        this.recordMetric('runtime_degraded_total', this.counters.degradedTotal);
      }
    }
    const orderedIntents = ordered;
    context = createRuntimeContext({ ...context, compiledIntents: orderedIntents });
    await this.state.transition('planning', context.correlationId);
    const orchestration = await this.decisionOrchestrator.orchestrate(found, context);
    const candidates = orchestration.candidates;
    await this.events.emit('runtime.candidate.generated', {
      correlationId: context.correlationId,
      candidateIds: candidates.map((candidate) => candidate.id),
      candidateCount: candidates.length,
      reason: orchestration.reason,
    });
    const compiledIntent: CompiledIntent | undefined =
      context.compiledIntents?.[0] ?? context.compiledIntent;
    const knowledgeString = (value: unknown): string | undefined =>
      typeof value === 'string' && value.length > 0 ? value : undefined;
    const destination = knowledgeString(compiledIntent?.target.destination);
    const providerId = knowledgeString(compiledIntent?.scope.provider);
    const scopeForCandidate = (candidate: CandidateAction) => {
      const candidateDestination = knowledgeString(candidate.metadata.destination);
      const candidateProvider = knowledgeString(candidate.metadata.providerId);
      const candidatePath = knowledgeString(candidate.metadata.pathId);
      const candidateRegion = knowledgeString(candidate.metadata.region);
      return {
        ...(candidateDestination ?? destination !== undefined
          ? { destination: (candidateDestination ?? destination) as string }
          : {}),
        ...(candidateProvider ?? providerId !== undefined
          ? { providerId: (candidateProvider ?? providerId) as string }
          : {}),
        ...(candidatePath !== undefined ? { pathId: candidatePath } : {}),
        ...(candidateRegion !== undefined ? { region: candidateRegion } : {}),
      };
    };
    const knowledgeStore = this.knowledgeStore;
    const evidenceFor =
      knowledgeStore !== undefined
        ? knowledgeEvidenceFunction({
            arbitrated: knowledgeStore.arbitrate({
              scope: {
                ...(destination !== undefined ? { destination } : {}),
                ...(providerId !== undefined ? { providerId } : {}),
              },
            }),
            baseEvidenceFor: (candidate: CandidateAction) => defaultEvidenceFor(candidate),
            arbitratedFor: (candidate: CandidateAction) =>
              knowledgeStore.arbitrate({ scope: scopeForCandidate(candidate) }),
          })
        : undefined;
    const { plan } = await new DeterministicPlanner().planAgainstObjectives(
      candidates,
      context,
      compiledIntent === undefined
        ? evidenceFor === undefined
          ? {}
          : { evidenceFor }
        : evidenceFor === undefined
          ? { intent: compiledIntent }
          : { intent: compiledIntent, evidenceFor },
    );
    // The planner is the canonical policy gate. Its selected action and
    // alternatives carry the policy evaluation reasons needed to explain why
    // an otherwise viable candidate was not executed.
    const evaluatedCandidates = [plan.selectedAction, ...plan.alternatives];
    await this.events.emit('runtime.plan.created', {
      correlationId: context.correlationId,
      planId: plan.id,
      decisionReason: orchestration.reason,
    });
    if (!plan.policyResult.allowed)
      return this.recordBlocked(
        context,
        before,
        observations,
        found,
        evaluatedCandidates,
        plan,
        start,
      );
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
          evaluatedCandidates,
          plan,
          start,
          validation,
        );
      if (!this.validator.lock(lockKey))
        return this.recordBlocked(
          context,
          before,
          observations,
          found,
          evaluatedCandidates,
          plan,
          start,
        );

      // Enforce autonomy: the selected action must be permitted by the intent's autonomy level
      const actionClass = (
        plan.selectedAction.intent in ACTION_CLASS
          ? ACTION_CLASS[plan.selectedAction.intent as keyof typeof ACTION_CLASS]
          : 'safe_mutate'
      ) as 'read' | 'advise' | 'safe_mutate' | 'autonomous' | 'high_risk';
      const intent = context.compiledIntents?.[0] ?? context.compiledIntent;
      if (intent) {
        try {
          this.policyArbitrator.enforceIntentAutonomy(intent, actionClass);
        } catch (error) {
          await this.events.emit('runtime.autonomy.violation', {
            correlationId: context.correlationId,
            intentId: intent.intentId,
            actionClass,
            error: error instanceof Error ? error.message : 'unknown',
          });
          return this.recordBlocked(
            context,
            before,
            observations,
            found,
            evaluatedCandidates,
            plan,
            start,
            {
              id: `validation-${Date.now()}`,
              schemaVersion: 1,
              createdAt: new Date().toISOString(),
              correlationId: context.correlationId,
              source: 'resilience-runtime',
              metadata: {},
              valid: false,
              reasons: [error instanceof Error ? error.message : 'autonomy violation'],
              policy: {
                allowed: false,
                reasons: [error instanceof Error ? error.message : 'autonomy violation'],
                requiredCapabilities: [],
              },
            },
          );
        }
      }

      let outcome: DecisionOutcome = 'simulated';
      let execution: ActionExecution | undefined;
      let verification;
      let recovery;
      let runtimeTransactionId: string | undefined;
      const verifier = new RuntimeActionVerifier(this.adapters);

      if (context.mode === 'simulation') {
        outcome = 'simulated';
      } else {
        // Every non-simulation mutation is a privileged mutation. The boundary is
        // constructed in every composition, so there is no alternate executor and
        // no knowledge-store-dependent branch: the legacy safety-kernel execution
        // path is retained only as the boundary's internal safety port.
        try {
          runtimeTransactionId = nextId('transaction');
          const mutationRequest = {
            plan,
            context,
            actor: { actorId: this.runtimeId, boundary: 'canonical-runtime' as const, grantedCapabilities: this.actorCapabilities, verified: true },
            mutationId: `mut-${Date.now()}`,
            idempotencyKey: input.idempotencyKey ?? plan.selectedAction.id,
            resourceId: plan.dependencies.join('|') || plan.selectedAction.intent,
            transactionId: runtimeTransactionId,
            epoch: this.mutationBoundary.currentEpoch(),
            ...(plan.metadata?.aiAdvisoryOnly ? { ai: { rationale: String(plan.metadata.rationale) } } : {}),
          };
          const boundaryResult = await this.mutationBoundary.mutate(mutationRequest);
          runtimeTransactionId = boundaryResult.transactionId;
          execution = boundaryResult.execution ?? { status: 'failed' } as ActionExecution;
          if (boundaryResult.status === 'blocked') {
            return this.recordBlocked(
              context,
              before,
              observations,
              found,
              evaluatedCandidates,
              plan,
              start,
              { ...validation, valid: false, reasons: boundaryResult.reasons },
            );
          }
          if (boundaryResult.status === 'failed' || boundaryResult.status === 'timed-out' || boundaryResult.status === 'cancelled') {
            throw new Error(`Mutation failed: ${boundaryResult.reasons.join(', ')}`);
          }
          if (boundaryResult.status === 'recovered') {
            // The privileged boundary has already compensated and verified the
            // rollback/recovery. Do not duplicate recovery through the legacy
            // safety path; record its verified recovery result and re-observe.
            const boundaryReasons = [
              ...boundaryResult.reasons,
              ...(boundaryResult.recovery?.reasons ?? []),
            ];
            recovery = {
              id: nextId('recovery'),
              schemaVersion: 1,
              createdAt: nowIso(),
              correlationId: context.correlationId,
              source: 'resilience-runtime',
              metadata: { transactionId: boundaryResult.transactionId },
              delegatedTo: 'failover' as const,
              status: 'success' as const,
              reason: boundaryReasons.join('; ') || 'privileged boundary recovered mutation',
            };
            outcome = 'recovered';
            await this.learnFromOutcome({
              plan,
              context,
              execution,
              transactionId: boundaryResult.transactionId,
              rollback: true,
            });
            await this.state.transition('observing', context.correlationId);
          } else {
            await this.events.emit('runtime.execution.completed', {
              correlationId: context.correlationId,
              transactionId: boundaryResult.transactionId,
              status: execution.status,
            });
            await this.state.transition('verifying', context.correlationId);
            verification = await verifier.verify(plan, execution, context);
            await this.events.emit('runtime.verification.completed', {
              correlationId: context.correlationId,
              transactionId: boundaryResult.transactionId,
              status: verification.status,
            });
            if (verification.status === 'failed') {
              await this.state.transition('recovering', context.correlationId);
              recovery = await this.safetyKernel.recover(
                plan,
                'verification failed',
                context,
                boundaryResult.transactionId,
              );
              outcome = 'degraded';
              await this.state.transition('degraded', context.correlationId);
            } else
              outcome =
                execution.status === 'success' && !execution.simulated ? 'success' : 'simulated';
            await this.learnFromOutcome({
              plan,
              context,
              execution,
              transactionId: boundaryResult.transactionId,
              rollback: recovery !== undefined,
            });
          }
        } catch (error) {
          if (error instanceof SafetyViolationError) {
            return this.recordBlocked(
              context,
              before,
              observations,
              found,
              evaluatedCandidates,
              plan,
              start,
              {
                ...validation,
                valid: false,
                reasons: [...validation.reasons, ...error.assessment.reasons],
              },
            );
          }
          throw error;
        }
      }
      const record = createDecisionRecord({
        context,
        before,
        after: this.state.current(),
        observations,
        incidents: found,
        policyEvaluation: plan.policyResult,
        candidates: evaluatedCandidates,
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
      this.recordMetric('runtime_actions_failed_total', this.counters.actionsFailedTotal);
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
  /**
   * Closes the loop: verify the real outcome, then let the canonical learning
   * loop record it.
   *
   * Learning is driven only by `verifyOutcome`, which reports `outcomeVerified`
   * false when no real destination/service/application probe ran. An unverified
   * outcome therefore becomes evidence without changing strategy selection,
   * failure memory or intensity. Probe failure must never fail the cycle, so the
   * whole step is defensive.
   */
  private async learnFromOutcome(input: {
    readonly plan: ActionPlan;
    readonly context: RuntimeContext;
    readonly execution: ActionExecution | undefined;
    readonly transactionId: string;
    readonly rollback: boolean;
  }): Promise<void> {
    try {
      const verification = await verifyOutcome({
        correlationId: input.context.correlationId,
        planId: input.plan.id,
        transactionId: input.transactionId,
        mutationId: input.plan.selectedAction.id,
        expectedPostconditions: input.plan.expectedPostconditions,
        actionStatus: input.execution?.status ?? 'unknown',
        probes: this.outcomeProbes,
        rollbackVerification: input.rollback,
      });
      const update = this.learningLoop.learn({
        verification,
        transactionId: input.transactionId,
        mutationId: input.plan.selectedAction.id,
        ...(typeof input.plan.metadata.strategyId === 'string'
          ? { strategyId: input.plan.metadata.strategyId }
          : {}),
        rollback: input.rollback,
      });
      await this.events.emit('runtime.outcome.verified', {
        correlationId: input.context.correlationId,
        transactionId: input.transactionId,
        outcomeVerified: verification.outcomeVerified,
        probes: verification.probeResults.length,
        learned: update.applied,
        rationale: update.rationale,
      });
      await this.events.emit('runtime.learning.applied', {
        correlationId: input.context.correlationId,
        transactionId: input.transactionId,
        evidenceId: update.evidenceId,
        applied: update.applied,
        rationale: update.rationale,
      });
    } catch {
      // A learning or probe failure must never escalate into a control failure:
      // the mutation outcome is already recorded and committed upstream.
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
    _execution?: ActionExecution,
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
