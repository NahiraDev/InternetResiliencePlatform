/**
 * Local control channel for the running daemon.
 *
 * The CLI used to build its own throwaway runtime, so `irp status` described a process that was
 * not the daemon. This server exposes the *running* daemon over a Unix domain socket instead.
 *
 * Security model:
 * - Unix socket only; the daemon never opens a TCP port for control.
 * - The parent directory is 0700 and the socket 0600, so only the daemon's user (root for the
 *   system service) can connect. There is no token because filesystem permissions are the
 *   authentication boundary; a stale socket from a dead process is replaced, a live one is not.
 * - Requests cannot request live mutation. `cycle` accepts only `simulation` or `safe`; the mode
 *   the daemon mutates in is fixed by its own configuration. Every cycle still runs through
 *   `ResilienceRuntime`, which stays the sole mutation authority.
 * - Bodies are size-limited and JSON-only.
 */
export { ControlClientError, controlRequest } from '@irp/resilience-runtime';
export interface ControlPort {
    health(): Promise<unknown>;
    snapshot(): Promise<unknown>;
    decisions(): Promise<unknown>;
    incidents(): Promise<unknown>;
    capabilities(): unknown;
    cycle(mode: 'simulation' | 'safe'): Promise<unknown>;
    reload(): Promise<unknown>;
}
/** Thrown by a ControlPort when the request is valid but conflicts with current runtime state. */
export declare class ControlConflictError extends Error {
    readonly status = 409;
    constructor(message: string);
}
export declare class ControlServer {
    private readonly socketPath;
    private readonly port;
    private server;
    constructor(socketPath: string, port: ControlPort);
    start(): Promise<void>;
    stop(): Promise<void>;
    private handle;
}
//# sourceMappingURL=control-server.d.ts.map