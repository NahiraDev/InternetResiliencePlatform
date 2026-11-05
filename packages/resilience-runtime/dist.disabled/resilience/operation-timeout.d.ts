/**
 * Cancellation/timeout helpers for issue #283.
 * Long-running operations must accept an AbortSignal and a deadline so a
 * degraded dependency cannot stall the canonical control loop.
 */
export declare class OperationTimeoutError extends Error {
    readonly operation: string;
    readonly timeoutMs: number;
    readonly code = "OPERATION_TIMEOUT";
    constructor(operation: string, timeoutMs: number);
}
/**
 * Races `work` against a timeout and an optional caller signal.
 * The timeout timer never keeps the process alive (unref) and is always cleared.
 */
export declare const withOperationTimeout: <T>(operation: string, work: Promise<T>, timeoutMs: number, signal?: AbortSignal) => Promise<T>;
//# sourceMappingURL=operation-timeout.d.ts.map