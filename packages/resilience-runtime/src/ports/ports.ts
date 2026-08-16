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
