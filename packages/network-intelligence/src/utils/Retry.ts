export interface RetryOptions {
  attempts: number;
  delayMs: number;
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');
};

export const retry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  signal?: AbortSignal,
): Promise<T> => {
  let last: unknown;
  for (let i = 0; i < options.attempts; i += 1) {
    throwIfAborted(signal);
    try {
      return await operation();
    } catch (error) {
      last = error;
      if (i < options.attempts - 1 && options.delayMs > 0)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.delayMs);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new DOMException('Operation aborted', 'AbortError'));
            },
            { once: true },
          );
        });
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
};
