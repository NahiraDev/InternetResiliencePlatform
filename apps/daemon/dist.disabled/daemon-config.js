/**
 * Resolution of daemon paths and execution mode from the environment.
 *
 * These are pure functions of `env` and the platform so they can be tested without touching the
 * filesystem. Live network mutation needs two independent opt-ins, mirroring the Linux client:
 * a single stray variable can never switch the daemon from observing to changing the host.
 */
export class DaemonConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DaemonConfigError';
    }
}
/**
 * `IRP_RUNTIME_MODE` is `safe` (default), `simulation` or `live`. `live` is refused unless
 * `IRP_ENABLE_LIVE_ROUTE_MUTATION=true` is also set, so a typo or a copied unit file cannot
 * start mutating routes silently.
 */
export const resolveRuntimeMode = (env) => {
    const raw = (env.IRP_RUNTIME_MODE ?? 'safe').trim().toLowerCase();
    if (raw !== 'safe' && raw !== 'simulation' && raw !== 'live')
        throw new DaemonConfigError(`IRP_RUNTIME_MODE must be safe, simulation or live, got: ${raw}`);
    if (raw === 'live' && env.IRP_ENABLE_LIVE_ROUTE_MUTATION !== 'true')
        throw new DaemonConfigError('IRP_RUNTIME_MODE=live also requires IRP_ENABLE_LIVE_ROUTE_MUTATION=true');
    return { mode: raw, liveRouteMutation: raw === 'live' };
};
export { resolveControlSocketPath, resolveStateDirectory } from '@irp/resilience-runtime';
//# sourceMappingURL=daemon-config.js.map