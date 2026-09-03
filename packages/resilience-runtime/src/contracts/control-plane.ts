import type { DomainEvent } from '@irp/events';
import type {
  ActionExecution,
  ActionPlan,
  ActionVerification,
  ObservationBatch,
  PolicyEvaluation,
  RuntimeContext,
} from '../domain/types.js';
import type { NetworkStateSnapshot } from '../state/network-state.js';

export const CONTROL_PLANE_CONTRACT_VERSION = 1 as const;

export type ControlPlaneDomain = 'intelligence' | 'policy' | 'execution' | 'assurance';

export type ControlPlaneEventType =
  | 'control-plane.intelligence.observation-reported'
  | 'control-plane.policy.evaluation-completed'
  | 'control-plane.execution.action-completed'
  | 'control-plane.assurance.verification-completed';

export interface ControlPlaneEvent<TType extends ControlPlaneEventType, TPayload>
  extends DomainEvent<TType, TPayload> {
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly producer: ControlPlaneDomain;
}

export interface IntelligenceObservationPayload {
  readonly observation: ObservationBatch;
  readonly state: NetworkStateSnapshot;
}

export interface PolicyEvaluationPayload {
  readonly plan: ActionPlan;
  readonly evaluation: PolicyEvaluation;
}

export interface ActionExecutionPayload {
  readonly plan: ActionPlan;
  readonly execution: ActionExecution;
}

export interface AssuranceVerificationPayload {
  readonly plan: ActionPlan;
  readonly execution: ActionExecution;
  readonly verification: ActionVerification;
}

export type IntelligenceObservationEvent = ControlPlaneEvent<
  'control-plane.intelligence.observation-reported',
  IntelligenceObservationPayload
>;

export type PolicyEvaluationEvent = ControlPlaneEvent<
  'control-plane.policy.evaluation-completed',
  PolicyEvaluationPayload
>;

export type ActionExecutionEvent = ControlPlaneEvent<
  'control-plane.execution.action-completed',
  ActionExecutionPayload
>;

export type AssuranceVerificationEvent = ControlPlaneEvent<
  'control-plane.assurance.verification-completed',
  AssuranceVerificationPayload
>;

export type ControlPlaneEventUnion =
  | IntelligenceObservationEvent
  | PolicyEvaluationEvent
  | ActionExecutionEvent
  | AssuranceVerificationEvent;

export interface ControlPlaneContractContext {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly runtimeContext: RuntimeContext;
}

export interface ControlPlaneContractBoundary {
  readonly domain: ControlPlaneDomain;
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION;
}
