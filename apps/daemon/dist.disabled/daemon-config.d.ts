/**
 * Resolution of daemon paths and execution mode from the environment.
 *
 * These are pure functions of `env` and the platform so they can be tested without touching the
 * filesystem. Live network mutation needs two independent opt-ins, mirroring the Linux client:
 * a single stray variable can never switch the daemon from observing to changing the host.
 */
import type { RuntimeMode } from '@irp/resilience-runtime';
export interface DaemonEnvironment {
    readonly [key: string]: string | undefined;
}
export interface DaemonModeResolution {
    readonly mode: RuntimeMode;
    readonly liveRouteMutation: boolean;
}
export declare class DaemonConfigError extends Error {
    constructor(message: string);
}
/**
 * `IRP_RUNTIME_MODE` is `safe` (default), `simulation` or `live`. `live` is refused unless
 * `IRP_ENABLE_LIVE_ROUTE_MUTATION=true` is also set, so a typo or a copied unit file cannot
 * start mutating routes silently.
 */
export declare const resolveRuntimeMode: (env: DaemonEnvironment) => DaemonModeResolution;
export { resolveControlSocketPath, resolveStateDirectory } from '@irp/resilience-runtime';
//# sourceMappingURL=daemon-config.d.ts.map