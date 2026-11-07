export interface PingResult {
    latencyMs: number;
    success: boolean;
}
export interface PingProvider {
    ping(host: string, signal: AbortSignal): Promise<PingResult>;
}
/** Deterministic in-process fixture for unit tests. */
export declare class MockablePingProvider implements PingProvider {
    ping(_host: string, signal: AbortSignal): Promise<PingResult>;
}
/** Production ICMP provider using the platform ping utility without a shell. */
export declare class SystemPingProvider implements PingProvider {
    private readonly timeoutMs;
    constructor(timeoutMs?: number);
    ping(host: string, signal: AbortSignal): Promise<PingResult>;
}
//# sourceMappingURL=PingProvider.d.ts.map