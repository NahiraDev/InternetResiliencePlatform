export interface PingResult { latencyMs: number; success: boolean; }
export interface PingProvider { ping(host: string, signal: AbortSignal): Promise<PingResult>; }
export class MockablePingProvider implements PingProvider { async ping(_host: string, signal: AbortSignal): Promise<PingResult> { signal.throwIfAborted(); return { latencyMs: 1, success: true }; } }
