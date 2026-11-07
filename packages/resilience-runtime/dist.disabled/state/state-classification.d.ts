/**
 * State classification for issue #281 (issue #272 Section J, task 2).
 *
 * Six state classes with genuinely different lifecycles. Treating them uniformly
 * is the failure this prevents: putting ephemeral runtime state in the database
 * makes local recovery depend on DB availability, while putting security state
 * in memory loses it on restart.
 *
 * The `criticalPath` flag is the important one: only ephemeral state may be
 * required to keep local safe control working. Durable security state must be
 * recoverable after restart, but local control must fail safe without it.
 */
export declare const STATE_CLASSES: readonly ["ephemeral-runtime", "persistent-operational", "historical", "analytics", "configuration", "security"];
export type StateClass = (typeof STATE_CLASSES)[number];
export interface StateClassSpec {
    readonly stateClass: StateClass;
    /** Durable across restart. */
    readonly durable: boolean;
    /** Required for local safe control to continue. True only for ephemeral state. */
    readonly criticalPath: boolean;
    /** Default retention in ms; `undefined` means retain indefinitely. */
    readonly retentionMs?: number;
    /** Whether the state may contain personal or sensitive payload. */
    readonly mayContainSensitivePayload: boolean;
    readonly description: string;
}
export declare const STATE_CLASS_SPECS: readonly StateClassSpec[];
export declare const specFor: (stateClass: StateClass) => StateClassSpec;
/**
 * Only ephemeral runtime state may be treated as a hard dependency. Durable
 * state, including security state, must degrade or fail safe rather than
 * disable local control.
 */
export declare const mayBlockLocalControl: (stateClass: StateClass) => boolean;
export interface StateAuditFinding {
    readonly stateClass: StateClass;
    readonly severity: 'MINOR' | 'MAJOR';
    readonly issue: string;
    readonly fix: string;
}
export interface StateAuditResult {
    readonly classified: Readonly<Record<string, StateClass>>;
    readonly findings: readonly StateAuditFinding[];
    readonly unclassified: readonly string[];
}
/**
 * Audits state placement: durable state must not also be critical-path,
 * because that implies local control depends on infrastructure. Analytics must
 * additionally never block local control.
 */
export declare const auditStatePlacement: (input: {
    readonly assignments: Readonly<Record<string, StateClass>>;
    /** State that must work with every optional dependency offline. */
    readonly mustWorkOffline?: readonly string[];
}) => StateAuditResult;
//# sourceMappingURL=state-classification.d.ts.map