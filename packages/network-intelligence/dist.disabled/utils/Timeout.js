export class TimeoutError extends Error {
    constructor(message = 'Operation timed out') {
        super(message);
        this.name = 'TimeoutError';
    }
}
export const throwIfAborted = (signal) => {
    if (signal?.aborted)
        throw new DOMException('Operation aborted', 'AbortError');
};
export const withTimeout = async (operation, timeoutMs, parentSignal) => {
    const controller = new AbortController();
    const onAbort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener('abort', onAbort, { once: true });
    let timer;
    try {
        return await Promise.race([
            operation(controller.signal),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const error = new TimeoutError();
                    controller.abort(error);
                    reject(error);
                }, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
        parentSignal?.removeEventListener('abort', onAbort);
    }
};
//# sourceMappingURL=Timeout.js.map