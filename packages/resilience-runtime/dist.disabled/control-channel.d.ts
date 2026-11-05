/**
 * Shared local control channel client and path resolution.
 *
 * The daemon serves the channel (apps/daemon); the CLI and other local tools consume it here so
 * both sides resolve the same socket path and speak the same protocol.
 */
export interface ControlEnvironment {
    readonly [key: string]: string | undefined;
}
/**
 * Where durable state lives. Returns `undefined` when persistence is intentionally off, which is
 * only the case for hermetic test runs that did not name a directory.
 */
export declare const resolveStateDirectory: (env: ControlEnvironment, options?: {
    readonly uid?: number;
    readonly home?: string;
}) => string | undefined;
/** Unix socket for the local control channel; owner-only, never a network listener. */
export declare const resolveControlSocketPath: (env: ControlEnvironment, options?: {
    readonly uid?: number;
}) => string | undefined;
/** Thin client used by the CLI. */
export declare class ControlClientError extends Error {
    readonly code: 'unreachable' | 'http';
    readonly status?: number | undefined;
    constructor(code: 'unreachable' | 'http', message: string, status?: number | undefined);
}
export declare const controlRequest: (socketPath: string, method: "GET" | "POST", path: string, body?: unknown, timeoutMs?: number) => Promise<unknown>;
//# sourceMappingURL=control-channel.d.ts.map