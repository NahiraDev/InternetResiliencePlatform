import type { DecisionRecord, RuntimeContext } from './domain/types.js';
import type { ResilienceRuntime } from './runtime.js';
import { type IntentDriftResult } from './intent/drift.js';
import type { CompiledIntent } from './domain/types.js';
export type ClosedLoopStopReason = 'healthy' | 'max_cycles' | 'blocked' | 'failed' | 'aborted';
export interface ClosedLoopOptions extends Partial<RuntimeContext> {
    /** Maximum number of runtime cycles to execute. Defaults to one for safe-by-default behavior. */
    readonly maxCycles?: number;
    /** Delay between cycles in milliseconds. Defaults to zero. */
    readonly intervalMs?: number;
    /** Stop after a healthy terminal outcome. Defaults to true. */
    readonly stopWhenHealthy?: boolean;
    /** Abort signal for cooperative cancellation between cycles. */
    readonly signal?: AbortSignal;
    /** Runtime context overrides applied to every cycle. */
    readonly context?: Partial<RuntimeContext>;
    /** Base idempotency key. Each cycle receives a deterministic suffix. */
    readonly idempotencyKey?: string;
    /** Base correlation id. Each cycle receives a deterministic suffix. */
    readonly correlationId?: string;
    /** Optional observe-only inputs for Phase 85 intent drift assessment. Never triggers mutation. */
    readonly driftInputs?: {
        readonly intent: CompiledIntent;
        readonly observed: Readonly<Record<string, unknown>>;
        readonly at?: Date;
    };
}
export interface ClosedLoopResult {
    readonly status: 'healthy' | 'bounded' | 'blocked' | 'failed' | 'aborted';
    readonly stopReason: ClosedLoopStopReason;
    readonly cyclesCompleted: number;
    readonly records: readonly DecisionRecord[];
    /** Observe-only drift assessments collected when driftInputs were supplied. */
    readonly driftAssessments?: readonly IntentDriftResult[];
}
export interface ClosedLoopRuntime {
    cycle(input: Partial<RuntimeContext> & {
        idempotencyKey?: string;
    }): Promise<DecisionRecord>;
}
/**
 * Runs the existing ResilienceRuntime in a bounded observe→decide→apply→verify/recover loop.
 * This class owns only loop control and stop conditions; decision, policy, execution,
 * verification and recovery remain owned by ResilienceRuntime and its canonical components.
 * Optional drift assessments are observe-only and must be re-admitted through governance
 * before any corrective action.
 */
export declare class BoundedClosedLoopController {
    private readonly runtime;
    constructor(runtime: ClosedLoopRuntime | Pick<ResilienceRuntime, 'cycle'>);
    run(options?: ClosedLoopOptions): Promise<ClosedLoopResult>;
}
//# sourceMappingURL=closed-loop.d.ts.map