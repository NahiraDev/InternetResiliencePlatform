export declare class TimeoutError extends Error {
    constructor(message?: string);
}
export declare const throwIfAborted: (signal?: AbortSignal) => void;
export declare const withTimeout: <T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parentSignal?: AbortSignal) => Promise<T>;
//# sourceMappingURL=Timeout.d.ts.map