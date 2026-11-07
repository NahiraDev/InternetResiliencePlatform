/**
 * Cancellation/timeout helpers for issue #283.
 * Long-running operations must accept an AbortSignal and a deadline so a
 * degraded dependency cannot stall the canonical control loop.
 */
export class OperationTimeoutError extends Error {
    operation;
    timeoutMs;
    code = 'OPERATION_TIMEOUT';
    constructor(operation, timeoutMs) {
        super(`operation '${operation}' exceeded its ${timeoutMs}ms budget`);
        this.operation = operation;
        this.timeoutMs = timeoutMs;
        this.name = 'OperationTimeoutError';
    }
}
const assertValidTimeout = (timeoutMs, name = 'timeoutMs') => {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
        throw new RangeError(`${name} must be an integer >= 1, got ${timeoutMs}`);
    }
};
/**
 * Races `work` against a timeout and an optional caller signal.
 * The timeout timer never keeps the process alive (unref) and is always cleared.
 */
export const withOperationTimeout = async (operation, work, timeoutMs, signal) => {
    assertValidTimeout(timeoutMs);
    if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('operation aborted');
    }
    let timer;
    try {
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new OperationTimeoutError(operation, timeoutMs)), timeoutMs);
            timer.unref?.();
        });
        if (!signal)
            return await Promise.race([work, timeout]);
        const aborted = new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason instanceof Error ? signal.reason : new Error('operation aborted')), { once: true });
        });
        return await Promise.race([work, timeout, aborted]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
};
//# sourceMappingURL=operation-timeout.js.map