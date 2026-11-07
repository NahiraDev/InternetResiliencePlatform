/**
 * Production Linux route executor behind the canonical kernel capability boundary.
 *
 * This is the concrete data-plane executor for route mutations. It is registered
 * as a {@link KernelContract} on the {@link KernelRuntime} and invoked by
 * `RoutingEngine.applyPlan()` / `RoutingEngine.rollbackPlan()` through
 * `kernel.execute('routing', 'applyRoutePlan', plan)`.
 *
 * It is NOT a second transaction authority. The canonical
 * {@link PrivilegedMutationBoundary} in `@irp/resilience-runtime` owns the
 * prepare → snapshot → validate → policy → security → safety → apply → verify
 * → commit transaction machine. This executor is the concrete `apply` step
 * behind that boundary, reached only after the boundary has authorized the
 * mutation.
 *
 * Safety properties:
 *
 * - Uses `execFile`, never shell strings — no arbitrary command execution.
 * - Allowlist: only `ip route show`, `ip route add`, `ip route replace`,
 *   `ip route delete`.
 * - Structured arguments derived from the {@link RoutePlan}, not from caller
 *   input.
 * - Pre-mutation state is captured before any mutation, keyed by plan id, so
 *   rollback can restore the exact prior route.
 * - Execution failures propagate as structured errors, never as success.
 * - Missing snapshot on rollback fails explicitly; it never simulates success.
 *
 * In-memory snapshot is acceptable for Work Package 1. Durable crash recovery
 * belongs to Work Package 3.
 */
import { type RouteJournal } from './route-journal.js';
import type { RoutePlan } from '@irp/routing';
export declare const IP_BINARY = "ip";
export declare const DEFAULT_TIMEOUT_MS = 5000;
/** Structured result of a single `ip route` command. */
export interface RouteCommandResult {
    readonly command: string;
    readonly args: readonly string[];
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly timedOut: boolean;
}
export interface RouteExecutorOptions {
    /** Network namespace for isolated execution (testing). */
    readonly netns?: string;
    readonly timeoutMs?: number;
    /**
     * Journal that persists snapshots and rollback commands before the kernel is mutated.
     * Defaults to an in-memory journal, which cannot survive a crash; production composition
     * supplies a {@link FileRouteJournal}.
     */
    readonly journal?: RouteJournal;
    /** How long verified journal entries stay available for late rollback. Default 24 hours. */
    readonly verifiedRetentionMs?: number;
}
/** Outcome of reconciling the journal after a restart. */
export interface RouteRecoveryReport {
    readonly rolledBack: readonly string[];
    readonly failed: readonly {
        readonly planId: string;
        readonly error: string;
    }[];
    readonly pruned: readonly string[];
    readonly corrupt: readonly string[];
}
/**
 * Pluggable command runner so unit tests can exercise the executor logic
 * without spawning real `ip` processes.
 */
export interface RouteCommandRunner {
    run(binary: string, args: readonly string[], options: {
        timeoutMs: number;
    }): Promise<RouteCommandResult>;
}
/** Real `execFile`-based runner used in production. */
export declare class ExecFileRouteCommandRunner implements RouteCommandRunner {
    run(binary: string, args: readonly string[], options: {
        timeoutMs: number;
    }): Promise<RouteCommandResult>;
}
/** Captured pre-mutation route state for a single mutation target. */
export interface RouteSnapshot {
    readonly planId: string;
    readonly target: string;
    readonly table: string;
    readonly family: 'ipv4' | 'ipv6';
    readonly exists: boolean;
    /** Raw JSON array from `ip -j route show`, or empty if absent. */
    readonly rawRoutes: readonly unknown[];
    /** Reconstructed route command arguments to restore the prior state. */
    readonly restoreArgs: readonly string[];
    readonly capturedAt: string;
}
/** Outcome of an apply operation. */
export interface RouteApplyResult {
    readonly ok: boolean;
    readonly planId: string;
    readonly error?: string;
    readonly result?: RouteCommandResult;
}
/** Outcome of a rollback operation. */
export interface RouteRollbackResult {
    readonly ok: boolean;
    readonly planId: string;
    readonly error?: string;
    readonly result?: RouteCommandResult;
}
export declare class RouteExecutorError extends Error {
    readonly details: Record<string, unknown>;
    readonly code: string;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
/**
 * Production Linux route executor.
 *
 * Registered as a {@link KernelContract} namespace `routing` on the
 * {@link KernelRuntime}. It is the concrete `apply`/`rollback` step behind the
 * canonical mutation boundary — it owns no policy, safety, or transaction
 * authority of its own.
 */
export declare class LinuxRouteExecutor {
    private readonly runner;
    private readonly options;
    private readonly snapshots;
    private readonly journal;
    private readonly journalEntries;
    constructor(runner?: RouteCommandRunner, options?: RouteExecutorOptions);
    /**
     * The ordered commands that return the host to its pre-mutation state.
     *
     * `ip route replace` identifies a route by prefix, table and metric. When the planned route
     * has a different metric than the one it displaced, the apply step *adds* a second route and
     * replaying the original only adds the original back, so the applied route must also be
     * deleted. When the keys are equal the replace already overwrote it, and deleting afterwards
     * would remove the restored route, so only the restore runs.
     */
    private rollbackCommandsFor;
    private runRollback;
    private persist;
    private forget;
    /**
     * Captures pre-mutation route state for a plan. Called before any mutation.
     */
    captureSnapshot(plan: RoutePlan): Promise<RouteSnapshot>;
    /**
     * Validates a plan before mutation. Rejects invalid plans before any
     * `ip route` command is run.
     */
    validatePlan(plan: RoutePlan): void;
    /**
     * Applies a route plan via `ip route replace`. Returns a structured result;
     * never throws on `ip` failure — the error is in the result.
     */
    applyRoutePlan(plan: RoutePlan): Promise<RouteApplyResult>;
    /**
     * Rolls back a previously applied plan using the captured snapshot.
     * If no snapshot exists, fails explicitly — never simulates success.
     */
    rollbackRoutePlan(plan: RoutePlan): Promise<RouteRollbackResult>;
    /**
     * Verifies that the route for a plan's target exists in the desired state.
     * Used as the verification step after apply.
     */
    verifyRoutePlan(plan: RoutePlan): Promise<boolean>;
    /**
     * Reconciles the journal after a restart. Mutations that were issued but never verified are
     * undone with the rollback command recorded before they ran; verified entries older than the
     * retention window are pruned. Failures are reported, never swallowed, and the entry is kept
     * so the next start retries.
     */
    recoverInterrupted(now?: () => number): Promise<RouteRecoveryReport>;
    /** Clears all captured snapshots (for testing). */
    clearSnapshots(): void;
    getSnapshot(planId: string): RouteSnapshot | undefined;
}
