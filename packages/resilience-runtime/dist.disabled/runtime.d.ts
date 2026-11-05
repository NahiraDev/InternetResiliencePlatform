import type { RuntimeContext, RuntimeSnapshot, ActionIntent } from './domain/types.js';
import { RuntimeStateMachine } from './state/state-machine.js';
import type { DecisionStore, IncidentStore } from './ports/ports.js';
import { EvidencePreservingEventSink, type EvidenceExporter } from './events/evidence-sink.js';
import { KnowledgeStore } from './knowledge/knowledge-store.js';
import { type RuntimeAdapterRegistry } from './adapter-registry.js';
import type { DecisionProvider, ObservationProvider, TelemetrySink } from './ports/ports.js';
import type { CanonicalNetworkControlPlane } from './canonical-network-adapter.js';
import { type SafetyKernelOptions } from './safety/safety-kernel.js';
import { MetricsRegistry } from '@irp/telemetry';
import { OutcomeLearningLoop } from './learning/outcome-learning-loop.js';
import { type OutcomeProbe } from './verification/outcome-verification.js';
import type { IntentStore } from './intent/arbitration.js';
import type { NetworkIntent } from '@irp/core';
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
    /**
     * Where decision records are kept. Defaults to memory, which is lost on restart; production
     * hosts pass a durable store so history survives crashes.
     */
    decisionStore?: DecisionStore;
    /** Where incidents are kept. Same durability note as `decisionStore`. */
    incidentStore?: IncidentStore;
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
    /**
     * Host-owned trust. The composition root (daemon) — never a cycle caller —
     * declares which capabilities and action intents this runtime may exercise.
     * When set, every cycle's security context, capability snapshot and policy
     * allow-list are derived from it and any caller-supplied values for those
     * fields are discarded, so trust cannot be forged per request. When omitted
     * the runtime stays fail-closed (untrusted context).
     */
    hostTrust?: HostTrust;
}
export interface HostTrust {
    readonly principal: string;
    readonly capabilities: readonly string[];
    readonly allowedActions: readonly ActionIntent[];
}
export declare class ResilienceRuntime {
    private readonly providers;
    private readonly started;
    private counters;
    /**
     * Authoritative local evidence log. The optional external exporter is
     * best-effort: a collector failure is counted and swallowed so it can never
     * disable safe local control (issue #281).
     */
    readonly events: EvidencePreservingEventSink;
    readonly telemetry: TelemetrySink;
    readonly telemetryRegistry: MetricsRegistry;
    readonly decisions: DecisionStore;
    readonly incidents: IncidentStore;
    /**
     * Assigned in the constructor: it depends on `events`, which itself depends
     * on constructor options, so a field initializer would run too early.
     */
    readonly state: RuntimeStateMachine;
    readonly runtimeId: string;
    readonly instanceId: string;
    readonly adapters: RuntimeAdapterRegistry;
    private readonly validator;
    private readonly decisionProvider;
    private readonly decisionOrchestrator;
    private readonly transactionEngine;
    private readonly mutationBoundary;
    readonly knowledgeStore: KnowledgeStore | undefined;
    readonly learningLoop: OutcomeLearningLoop;
    readonly outcomeProbes: readonly OutcomeProbe[];
    readonly actorCapabilities: readonly string[];
    private readonly hostTrust;
    private readonly safetyKernel;
    private readonly networkControlPlane;
    private readonly policyArbitrator;
    private inFlight;
    private idempotency;
    private last?;
    constructor(providers?: readonly ObservationProvider[], options?: ResilienceRuntimeOptions);
    capabilities(): import("./adapter-registry.js").RuntimeAdapterDescriptor[];
    runCycle(input?: Partial<RuntimeContext> & {
        idempotencyKey?: string;
    }): Promise<import("./domain/types.js").DecisionRecord>;
    runIntent(intent: NetworkIntent, input?: Partial<RuntimeContext> & {
        idempotencyKey?: string;
    }): Promise<import("./domain/types.js").DecisionRecord>;
    runIntents(intents: readonly NetworkIntent[], input?: Partial<RuntimeContext> & {
        idempotencyKey?: string;
    }): Promise<import("./domain/types.js").DecisionRecord>;
    /**
     * Resolves true once no cycle is running, false if one is still running after `timeoutMs`.
     * Used by hosts at shutdown so a mutation in flight is allowed to reach verification (or its
     * rollback) instead of being cut off by process exit.
     */
    whenIdle(timeoutMs: number): Promise<boolean>;
    private applyHostTrust;
    cycle(input?: Partial<RuntimeContext> & {
        idempotencyKey?: string;
    }): Promise<import("./domain/types.js").DecisionRecord>;
    private executeCycle;
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
    private learnFromOutcome;
    private recordBlocked;
    getRuntimeSnapshot(): Promise<RuntimeSnapshot>;
    private recordMetric;
}
//# sourceMappingURL=runtime.d.ts.map