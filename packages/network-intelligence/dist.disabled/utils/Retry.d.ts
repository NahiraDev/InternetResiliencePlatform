export interface RetryOptions {
    attempts: number;
    delayMs: number;
}
export declare const retry: <T>(operation: () => Promise<T>, options: RetryOptions, signal?: AbortSignal) => Promise<T>;
//# sourceMappingURL=Retry.d.ts.map