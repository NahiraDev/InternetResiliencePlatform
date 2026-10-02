/**
 * Cancellation/timeout helpers for issue #283.
 * Long-running operations must accept an AbortSignal and a deadline so a
 * degraded dependency cannot stall the canonical control loop.
 */

export class OperationTimeoutError extends Error {
  readonly code = 'OPERATION_TIMEOUT';
  constructor(
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super(`operation '${operation}' exceeded its ${timeoutMs}ms budget`);
    this.name = 'OperationTimeoutError';
  }
}

export const assertValidTimeout = (timeoutMs: number, name = 'timeoutMs'): void => {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError(`${name} must be an integer >= 1, got ${timeoutMs}`);
  }
};

/**
 * Races `work` against a timeout and an optional caller signal.
 * The timeout timer never keeps the process alive (unref) and is always cleared.
 */
export const withOperationTimeout = async <T>(
  operation: string,
  work: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> => {
  assertValidTimeout(timeoutMs);
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('operation aborted');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OperationTimeoutError(operation, timeoutMs)), timeoutMs);
      (timer as unknown as { unref?: () => void }).unref?.();
    });
    if (!signal) return await Promise.race([work, timeout]);
    const aborted = new Promise<never>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(signal.reason instanceof Error ? signal.reason : new Error('operation aborted')),
        { once: true },
      );
    });
    return await Promise.race([work, timeout, aborted]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
