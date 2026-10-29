/**
 * Resolution of daemon paths and execution mode from the environment.
 *
 * These are pure functions of `env` and the platform so they can be tested without touching the
 * filesystem. Live network mutation needs two independent opt-ins, mirroring the Linux client:
 * a single stray variable can never switch the daemon from observing to changing the host.
 */

import { join } from 'node:path';
import type { RuntimeMode } from '@irp/resilience-runtime';

export interface DaemonEnvironment {
  readonly [key: string]: string | undefined;
}

export interface DaemonModeResolution {
  readonly mode: RuntimeMode;
  readonly liveRouteMutation: boolean;
}

export class DaemonConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DaemonConfigError';
  }
}

/**
 * `IRP_RUNTIME_MODE` is `safe` (default), `simulation` or `live`. `live` is refused unless
 * `IRP_ENABLE_LIVE_ROUTE_MUTATION=true` is also set, so a typo or a copied unit file cannot
 * start mutating routes silently.
 */
export const resolveRuntimeMode = (env: DaemonEnvironment): DaemonModeResolution => {
  const raw = (env.IRP_RUNTIME_MODE ?? 'safe').trim().toLowerCase();
  if (raw !== 'safe' && raw !== 'simulation' && raw !== 'live')
    throw new DaemonConfigError(`IRP_RUNTIME_MODE must be safe, simulation or live, got: ${raw}`);
  if (raw === 'live' && env.IRP_ENABLE_LIVE_ROUTE_MUTATION !== 'true')
    throw new DaemonConfigError(
      'IRP_RUNTIME_MODE=live also requires IRP_ENABLE_LIVE_ROUTE_MUTATION=true',
    );
  return { mode: raw, liveRouteMutation: raw === 'live' };
};

/**
 * Where durable state lives. Returns `undefined` when persistence is intentionally off, which is
 * only the case for hermetic test runs that did not name a directory.
 */
export const resolveStateDirectory = (
  env: DaemonEnvironment,
  options: { readonly uid?: number; readonly home?: string } = {},
): string | undefined => {
  if (env.IRP_STATE_DIR) return env.IRP_STATE_DIR;
  if (env.VITEST) return undefined;
  const uid = options.uid ?? (typeof process.getuid === 'function' ? process.getuid() : undefined);
  if (uid === 0) return '/var/lib/irp';
  if (env.XDG_STATE_HOME) return join(env.XDG_STATE_HOME, 'irp');
  const home = options.home ?? env.HOME;
  if (home) return join(home, '.local', 'state', 'irp');
  return undefined;
};

/** Unix socket for the local control channel; owner-only, never a network listener. */
export const resolveControlSocketPath = (
  env: DaemonEnvironment,
  options: { readonly uid?: number } = {},
): string | undefined => {
  if (env.IRP_CONTROL_SOCKET) return env.IRP_CONTROL_SOCKET === 'disabled' ? undefined : env.IRP_CONTROL_SOCKET;
  if (env.VITEST) return undefined;
  const uid = options.uid ?? (typeof process.getuid === 'function' ? process.getuid() : undefined);
  if (uid === 0) return '/run/irp/irp.sock';
  if (env.XDG_RUNTIME_DIR) return join(env.XDG_RUNTIME_DIR, 'irp', 'irp.sock');
  const state = resolveStateDirectory(env, options);
  return state ? join(state, 'irp.sock') : undefined;
};
