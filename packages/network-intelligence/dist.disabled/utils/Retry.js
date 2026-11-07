import { throwIfAborted } from './Timeout.js';
export const retry = async (operation, options, signal) => {
    let last;
    for (let i = 0; i < options.attempts; i += 1) {
        throwIfAborted(signal);
        try {
            return await operation();
        }
        catch (error) {
            last = error;
            if (i < options.attempts - 1 && options.delayMs > 0)
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(resolve, options.delayMs);
                    signal?.addEventListener('abort', () => {
                        clearTimeout(timer);
                        reject(new DOMException('Operation aborted', 'AbortError'));
                    }, { once: true });
                });
        }
    }
    throw last instanceof Error ? last : new Error(String(last));
};
//# sourceMappingURL=Retry.js.map