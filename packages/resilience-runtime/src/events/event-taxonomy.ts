/**
 * Versioned event taxonomy and identity semantics for issue #281
 * (issue #272 Section J, tasks 1, 5 and 7).
 *
 * A pre-existing `runtimeEvents` list was a flat array of strings with no
 * version, no stage and no declared identity semantics, and it had drifted from
 * the names the runtime actually emits. It has been removed: this taxonomy is
 * the single event-name contract. A flat list cannot support reconstructing an
 * incident, because nothing says which stage an event belongs to or how the ids
 * relate.
 *
 * Every event declares:
 *  - a stable type name;
 *  - the pipeline stage it belongs to;
 *  - a schema version, so consumers can migrate rather than guess;
 *  - the identity fields it carries.
 */

/** The end-to-end pipeline stages, in causal order (task 5). */
export const PIPELINE_STAGES = [
  'trigger',
  'evidence',
  'diagnosis',
  'candidate',
  'decision',
  'policy',
  'safety',
  'plan',
  'action',
  'verification',
  'outcome',
  'recovery',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * Identity semantics (task 7).
 *
 *  - `correlationId` spans one causal chain and is minted once, at the trigger.
 *    Everything downstream must carry the same value.
 *  - `decisionId` identifies one decision and begins when the decision record
 *    is persisted; it may fork because a chain can contain many decisions.
 *  - `transactionId` identifies one mutation attempt and begins when the
 *    mutation boundary starts that attempt.
 *
 * The three are deliberately distinct: reusing one id for all three is exactly
 * what makes a trace ambiguous. Earlier stages therefore require only the IDs
 * that can already exist.
 */
export const IDENTITY_FIELDS = [
  'correlationId',
  'decisionId',
  'transactionId',
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

/** Current taxonomy version. Bumped only for breaking shape changes. */
export const EVENT_TAXONOMY_VERSION = 1;

export interface EventDefinition {
  readonly type: string;
  readonly stage: PipelineStage;
  readonly schemaVersion: number;
  /** Identity fields this event is required to carry. */
  readonly requiredIdentity: readonly IdentityField[];
  readonly description: string;
}

/** Builds a definition with the taxonomy defaults applied. */
const define = (
  type: string,
  stage: PipelineStage,
  requiredIdentity: readonly IdentityField[],
  description: string,
): EventDefinition =>
  Object.freeze({
    type,
    stage,
    schemaVersion: EVENT_TAXONOMY_VERSION,
    requiredIdentity: Object.freeze([...requiredIdentity]),
    description,
  });

/**
 * The canonical taxonomy. Stages are explicit so a trace can be validated for
 * causal ordering rather than reconstructed by string-guessing.
 */
export const EVENT_TAXONOMY: readonly EventDefinition[] = Object.freeze([
  // --- trigger ---
  define('runtime.cycle.started', 'trigger', ['correlationId'], 'A control cycle began.'),
  define('runtime.cycle.failed', 'trigger', ['correlationId'], 'A control cycle ended in failure.'),
  // --- evidence ---
  define('runtime.observation.updated', 'evidence', ['correlationId'], 'New observation evidence was admitted.'),
  define('runtime.fabric.discovered', 'evidence', ['correlationId'], 'Programmable fabric resources were discovered.'),
  // --- diagnosis ---
  define('runtime.incident.detected', 'diagnosis', ['correlationId'], 'An incident was classified from evidence.'),
  define('autopilot.circuit_breaker.opened', 'diagnosis', ['correlationId'], 'A circuit breaker opened.'),
  // --- candidate ---
  define('runtime.candidate.generated', 'candidate', ['correlationId'], 'Candidate actions were generated from a diagnosis.'),
  define('runtime.arbitration.conflict', 'candidate', ['correlationId'], 'Intent arbitration reported a conflict.'),
  // --- decision ---
  define('runtime.decision.recorded', 'decision', ['correlationId', 'decisionId'], 'A decision record was persisted.'),
  // --- policy ---
  define('runtime.policy.evaluated', 'policy', ['correlationId'], 'Policy was evaluated for a candidate.'),
  // --- safety ---
  define('runtime.safety.assessed', 'safety', ['correlationId'], 'Safety kernel assessed a plan.'),
  define('runtime.safety.blocked', 'safety', ['correlationId'], 'Safety blocked a plan.'),
  define('runtime.safety.checkpoint.created', 'safety', ['correlationId'], 'A safety checkpoint was captured.'),
  define('runtime.safety.completed', 'safety', ['correlationId'], 'Safety evaluation completed.'),
  define('runtime.mutation.blocked', 'safety', ['correlationId', 'transactionId'], 'A mutation was blocked by a gate.'),
  define('runtime.mutation.ai-intent-ignored', 'safety', ['correlationId', 'transactionId'], 'An AI-recommended intent was discarded.'),
  define('runtime.autonomy.violation', 'safety', ['correlationId'], 'An autonomy boundary was violated.'),
  // --- plan ---
  define('runtime.plan.created', 'plan', ['correlationId'], 'An action plan was produced.'),
  define('runtime.plan.rejected', 'plan', ['correlationId'], 'A plan was rejected.'),
  // --- action ---
  define('runtime.execution.started', 'action', ['correlationId', 'transactionId'], 'A mutation began applying.'),
  define('runtime.execution.completed', 'action', ['correlationId', 'transactionId'], 'A mutation returned a result.'),
  define('runtime.execution.failed', 'action', ['correlationId', 'transactionId'], 'A mutation failed.'),
  define('runtime.mutation.applying', 'action', ['correlationId', 'transactionId'], 'A mutation is about to be applied.'),
  define('runtime.mutation.committed', 'action', ['correlationId', 'transactionId'], 'A mutation was committed.'),
  define('runtime.transaction.created', 'action', ['correlationId', 'transactionId'], 'A transaction was created.'),
  define('runtime.transaction.executing', 'action', ['correlationId', 'transactionId'], 'A transaction began executing.'),
  define('runtime.transaction.duplicate', 'action', ['correlationId', 'transactionId'], 'A duplicate transaction was suppressed.'),
  define('runtime.transaction.committed', 'action', ['correlationId', 'transactionId'], 'A transaction committed.'),
  define('runtime.transaction.failed', 'action', ['correlationId', 'transactionId'], 'A transaction failed.'),
  // --- verification ---
  define('runtime.verification.started', 'verification', ['correlationId', 'transactionId'], 'Outcome verification began.'),
  define('runtime.verification.completed', 'verification', ['correlationId', 'transactionId'], 'Outcome verification finished.'),
  // --- outcome ---
  define('runtime.outcome.verified', 'outcome', ['correlationId', 'transactionId'], 'A verified outcome was learned from.'),
  define('runtime.learning.applied', 'outcome', ['correlationId', 'transactionId'], 'Outcome evidence was passed to the learning loop.'),
  define('runtime.state.changed', 'outcome', ['correlationId'], 'Runtime state transitioned.'),
  define('runtime.state.blocked', 'outcome', ['correlationId'], 'Runtime entered the blocked state.'),
  define('runtime.state.degraded', 'outcome', ['correlationId'], 'Runtime entered the degraded state.'),
  define('runtime.state.failed', 'outcome', ['correlationId'], 'Runtime entered the failed state.'),
  // --- recovery ---
  define('runtime.recovery.started', 'recovery', ['correlationId', 'transactionId'], 'Recovery began.'),
  define('runtime.recovery.completed', 'recovery', ['correlationId', 'transactionId'], 'Recovery finished.'),
  define('runtime.safety.rollback.started', 'recovery', ['correlationId', 'transactionId'], 'Rollback began.'),
  define('runtime.safety.rollback.completed', 'recovery', ['correlationId', 'transactionId'], 'Rollback finished.'),
  define('runtime.safety.rollback.failed', 'recovery', ['correlationId', 'transactionId'], 'Rollback failed.'),
  define('runtime.mutation.rolledback', 'recovery', ['correlationId', 'transactionId'], 'A mutation was compensated and verified.'),
  define('runtime.safety.recovery.started', 'recovery', ['correlationId', 'transactionId'], 'Safety recovery began.'),
  define('runtime.safety.recovery.completed', 'recovery', ['correlationId', 'transactionId'], 'Safety recovery finished.'),
  define('runtime.mutation.recovered', 'recovery', ['correlationId', 'transactionId'], 'Recovery succeeded after escalation.'),
  define('runtime.mutation.recovery-failed', 'recovery', ['correlationId', 'transactionId'], 'Recovery failed and needs operator action.'),
]);

export const eventDefinition = (type: string): EventDefinition | undefined =>
  EVENT_TAXONOMY.find((definition) => definition.type === type);

export const isKnownEvent = (type: string): boolean => eventDefinition(type) !== undefined;

/**
 * Validates an event against its definition. Returns the reasons it is invalid
 * rather than throwing, because an invalid optional event must never break the
 * control loop.
 */
export const validateEvent = (
  type: string,
  payload: Readonly<Record<string, unknown>>,
): { readonly valid: boolean; readonly reasons: readonly string[]; readonly stage?: PipelineStage } => {
  const definition = eventDefinition(type);
  if (!definition) {
    return { valid: false, reasons: [`unknown-event-type:${type}`] };
  }
  const reasons: string[] = [];
  for (const field of definition.requiredIdentity) {
    const value = payload[field];
    if (value === undefined || value === null || value === '') {
      reasons.push(`missing-identity:${field}`);
    }
  }
  return {
    valid: reasons.length === 0,
    reasons,
    stage: definition.stage,
  };
};

/** Every known type for a stage, in declaration order. */
export const eventsForStage = (stage: PipelineStage): readonly EventDefinition[] =>
  Object.freeze(EVENT_TAXONOMY.filter((definition) => definition.stage === stage));

export interface IdentityScope {
  readonly correlationId: string;
  /** Present once a decision has been made. */
  readonly decisionId?: string;
  /** Present once a mutation is attempted. */
  readonly transactionId?: string;
}

/**
 * Derives the identity payload for a stage. Mints nothing: ids must be created
 * at their owning stage and inherited downstream, so a fabricated id cannot be
 * silently attached later.
 */
export const identityFor = (
  scope: IdentityScope,
  stage: PipelineStage,
): Readonly<Record<string, string>> => {
  const payload: Record<string, string> = { correlationId: scope.correlationId };
  if (stage !== 'trigger' && stage !== 'evidence' && scope.decisionId !== undefined) {
    payload.decisionId = scope.decisionId;
  }
  if (
    scope.transactionId !== undefined &&
    ['action', 'verification', 'outcome', 'recovery'].includes(stage)
  ) {
    payload.transactionId = scope.transactionId;
  }
  return Object.freeze(payload);
};
