import type {
  ActionExecution,
  ActionPlan,
  ActionValidation,
  ActionVerification,
  CandidateAction,
  DecisionRecord,
  Incident,
  ObservationProviderResult,
  PolicyEvaluation,
  RecoveryPlan,
  RuntimeContext,
  RuntimeSnapshot,
  RuntimeState,
} from '../domain/types.js';
import type { HistoricalObservation } from '@irp/network-intelligence';
export interface ObservationProvider {
  readonly id: string;
  collect(context: RuntimeContext): Promise<ObservationProviderResult>;
}
export interface IncidentCorrelationProvider {
  correlate(
    batch: import('../domain/types.js').ObservationBatch,
    context: RuntimeContext,
  ): Promise<readonly Incident[]>;
}
export interface PolicyProvider {
  evaluate(plan: ActionPlan | CandidateAction, context: RuntimeContext): Promise<PolicyEvaluation>;
}
export interface DecisionProvider {
  decide(
    incidents: readonly Incident[],
    context: RuntimeContext,
  ): Promise<readonly CandidateAction[]>;
}
/**
 * Read-only path evidence supplied by the domain routing owner. The provider
 * may rank paths, but it cannot authorize or mutate them; the runtime still
 * applies policy, safety, transaction, and destination verification.
 */
export interface PathStrategyEvidence {
  readonly destination: string;
  readonly recommendation: 'remain' | 'switch' | 'unavailable';
  readonly currentPathId?: string;
  readonly selectedPathId?: string;
  readonly currentScore?: number;
  readonly selectedScore?: number;
  readonly candidatePaths: readonly {
    readonly id: string;
    readonly type: string;
    readonly score?: number;
    readonly state: string;
    readonly failureDomains: readonly string[];
  }[];
  readonly diverseAlternativeCount: number;
  readonly confidence: number;
  readonly expectedBenefit: number;
  readonly risk: number;
  readonly explanation: readonly string[];
}
export interface PathEvidenceProvider {
  evaluate(context: RuntimeContext): Promise<PathStrategyEvidence | undefined>;
}
/**
 * Read-only, advisory history boundary. Implementations must not perform
 * mutations or make policy decisions; unavailable history is intentionally
 * treated as no additional evidence so local recovery can continue.
 */
export interface HistoricalEvidenceProvider {
  observationsFor(
    candidates: readonly CandidateAction[],
    incidents: readonly Incident[],
    context: RuntimeContext,
  ): Promise<Readonly<Record<string, readonly HistoricalObservation[]>>>;
}
/**
 * Read-only, advisory federation boundary. Federated evidence deliberately
 * shares the historical observation shape so the canonical decision provider
 * can consume it through the same guarded ranking path without granting
 * remote evidence authority over policy or mutation.
 */
export type FederatedEvidenceProvider = HistoricalEvidenceProvider;
export interface ActionPlanner {
  plan(candidates: readonly CandidateAction[], context: RuntimeContext): Promise<ActionPlan>;
}
export interface ActionValidator {
  validate(plan: ActionPlan, context: RuntimeContext): Promise<ActionValidation>;
}
export interface ActionExecutor {
  execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
}
export interface ActionVerifier {
  verify(
    plan: ActionPlan,
    execution: ActionExecution,
    context: RuntimeContext,
  ): Promise<ActionVerification>;
}
export interface RecoveryProvider {
  recover(plan: ActionPlan, reason: string, context: RuntimeContext): Promise<RecoveryPlan>;
}
export interface CapabilityProvider {
  snapshot(context: RuntimeContext): Promise<RuntimeContext['capabilitySnapshot']>;
}
export interface DecisionStore {
  put(record: DecisionRecord): Promise<void>;
  list(): Promise<readonly DecisionRecord[]>;
  get(id: string): Promise<DecisionRecord | undefined>;
}
export interface IncidentStore {
  put(incident: Incident): Promise<void>;
  list(): Promise<readonly Incident[]>;
}
export interface RuntimeStateStore {
  get(): Promise<RuntimeState>;
  set(state: RuntimeState): Promise<void>;
}
export interface EventSink {
  emit(event: string, payload: Readonly<Record<string, unknown>>): Promise<void>;
}
export interface TelemetrySink {
  increment(metric: string, value?: number): void;
  observe(metric: string, value: number): void;
  snapshot(): Readonly<Record<string, number>>;
}
export interface RuntimeStatusProvider {
  snapshot(): Promise<RuntimeSnapshot>;
}
