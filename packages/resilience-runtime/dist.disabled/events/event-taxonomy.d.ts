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
export declare const PIPELINE_STAGES: readonly ["trigger", "evidence", "diagnosis", "candidate", "decision", "policy", "safety", "plan", "action", "verification", "outcome", "recovery"];
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
export declare const IDENTITY_FIELDS: readonly ["correlationId", "decisionId", "transactionId"];
export type IdentityField = (typeof IDENTITY_FIELDS)[number];
/** Current taxonomy version. Bumped only for breaking shape changes. */
export declare const EVENT_TAXONOMY_VERSION = 1;
export interface EventDefinition {
    readonly type: string;
    readonly stage: PipelineStage;
    readonly schemaVersion: number;
    /** Identity fields this event is required to carry. */
    readonly requiredIdentity: readonly IdentityField[];
    readonly description: string;
}
/**
 * The canonical taxonomy. Stages are explicit so a trace can be validated for
 * causal ordering rather than reconstructed by string-guessing.
 */
export declare const EVENT_TAXONOMY: readonly EventDefinition[];
export declare const eventDefinition: (type: string) => EventDefinition | undefined;
export declare const isKnownEvent: (type: string) => boolean;
/**
 * Validates an event against its definition. Returns the reasons it is invalid
 * rather than throwing, because an invalid optional event must never break the
 * control loop.
 */
export declare const validateEvent: (type: string, payload: Readonly<Record<string, unknown>>) => {
    readonly valid: boolean;
    readonly reasons: readonly string[];
    readonly stage?: PipelineStage;
};
/** Every known type for a stage, in declaration order. */
export declare const eventsForStage: (stage: PipelineStage) => readonly EventDefinition[];
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
export declare const identityFor: (scope: IdentityScope, stage: PipelineStage) => Readonly<Record<string, string>>;
//# sourceMappingURL=event-taxonomy.d.ts.map