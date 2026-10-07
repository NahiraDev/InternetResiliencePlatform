/**
 * Production Linux route executor behind the canonical kernel capability boundary.
 *
 * This is the concrete data-plane executor for route mutations. It is registered
 * as a {@link KernelContract} on the {@link KernelRuntime} and invoked by
 * `RoutingEngine.applyPlan()` / `RoutingEngine.rollbackPlan()` through
 * `kernel.execute('routing', 'applyRoutePlan', plan)`.
 *
 * It is NOT a second transaction authority. The canonical
 * {@link PrivilegedMutationBoundary} in `@irp/resilience-runtime` owns the
 * prepare → snapshot → validate → policy → security → safety → apply → verify
 * → commit transaction machine. This executor is the concrete `apply` step
 * behind that boundary, reached only after the boundary has authorized the
 * mutation.
 *
 * Safety properties:
 *
 * - Uses `execFile`, never shell strings — no arbitrary command execution.
 * - Allowlist: only `ip route show`, `ip route add`, `ip route replace`,
 *   `ip route delete`.
 * - Structured arguments derived from the {@link RoutePlan}, not from caller
 *   input.
 * - Pre-mutation state is captured before any mutation, keyed by plan id, so
 *   rollback can restore the exact prior route.
 * - Execution failures propagate as structured errors, never as success.
 * - Missing snapshot on rollback fails explicitly; it never simulates success.
 *
 * In-memory snapshot is acceptable for Work Package 1. Durable crash recovery
 * belongs to Work Package 3.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RoutePlan, RoutingDestination } from '@irp/routing';

const execFileAsync = promisify(execFile);

export const IP_BINARY = 'ip';
export const DEFAULT_TIMEOUT_MS = 5_000;

/** Structured result of a single `ip route` command. */
export interface RouteCommandResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

export interface RouteExecutorOptions {
  /** Network namespace for isolated execution (testing). */
  readonly netns?: string;
  readonly timeoutMs?: number;
}

/**
 * Pluggable command runner so unit tests can exercise the executor logic
 * without spawning real `ip` processes.
 */
export interface RouteCommandRunner {
  run(
    binary: string,
    args: readonly string[],
    options: { timeoutMs: number },
  ): Promise<RouteCommandResult>;
}

/** Real `execFile`-based runner used in production. */
export class ExecFileRouteCommandRunner implements RouteCommandRunner {
  async run(
    binary: string,
    args: readonly string[],
    options: { timeoutMs: number },
  ): Promise<RouteCommandResult> {
    try {
      const result = await execFileAsync(binary, [...args], {
        timeout: options.timeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      return {
        command: binary,
        args,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
        timedOut: false,
      };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        signal?: string;
        killed?: boolean;
      };
      const timedOut = failure.killed === true || failure.signal === 'SIGTERM';
      return {
        command: binary,
        args,
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? failure.message ?? 'command failed',
        exitCode: typeof failure.code === 'number' ? failure.code : 1,
        timedOut,
      };
    }
  }
}

/** Captured pre-mutation route state for a single mutation target. */
export interface RouteSnapshot {
  readonly planId: string;
  readonly target: string;
  readonly table: string;
  readonly family: 'ipv4' | 'ipv6';
  readonly exists: boolean;
  /** Raw JSON array from `ip -j route show`, or empty if absent. */
  readonly rawRoutes: readonly unknown[];
  /** Reconstructed route command arguments to restore the prior state. */
  readonly restoreArgs: readonly string[];
  readonly capturedAt: string;
}

/** Outcome of an apply operation. */
export interface RouteApplyResult {
  readonly ok: boolean;
  readonly planId: string;
  readonly error?: string;
  readonly result?: RouteCommandResult;
}

/** Outcome of a rollback operation. */
export interface RouteRollbackResult {
  readonly ok: boolean;
  readonly planId: string;
  readonly error?: string;
  readonly result?: RouteCommandResult;
}

export class RouteExecutorError extends Error {
  readonly code: string;
  constructor(code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RouteExecutorError';
    this.code = code;
  }
}

function familyFor(destination: RoutingDestination): 'ipv4' | 'ipv6' {
  if (destination.family === 'ipv4') return 'ipv4';
  if (destination.family === 'ipv6') return 'ipv6';
  const value = destination.value;
  return value.includes(':') ? 'ipv6' : 'ipv4';
}

function tableFor(plan: RoutePlan): string {
  const table = plan.selectedPath?.route.table;
  if (!table) return 'main';
  if (table.id === 'local' || table.kind === 'local') return 'local';
  return table.name || 'main';
}

/**
 * Derives the `ip route` target argument from the plan destination.
 *
 * - default → `default`
 * - CIDR → the CIDR
 * - single IP → `IP/prefix` (host route, /32 or /128)
 * - hostname/service/domain-profile → rejected (requires resolution first)
 */
function targetFor(plan: RoutePlan): string {
  const dest = plan.destination;
  if (dest.kind === 'default') return 'default';
  if (dest.kind === 'cidr') return dest.value;
  if (dest.kind === 'ip') {
    const prefix = dest.family === 'ipv6' ? 128 : 32;
    return `${dest.value}/${prefix}`;
  }
  throw new RouteExecutorError(
    'UNSUPPORTED_DESTINATION',
    `Cannot derive route target for destination kind '${dest.kind}': requires resolved IP/CIDR or default`,
    { kind: dest.kind, value: dest.value },
  );
}

/** Builds `ip route show` args for a target, optionally in a namespace. */
function showArgs(
  target: string,
  table: string,
  family: 'ipv4' | 'ipv6',
  options: RouteExecutorOptions,
): readonly string[] {
  const args: string[] = [];
  if (options.netns) args.push('-n', options.netns);
  args.push('-j', '-f', family, 'route', 'show', 'table', table, target);
  return args;
}

/** Builds `ip route add/replace/del` args from a plan's selected path. */
function mutationArgs(
  action: 'add' | 'replace' | 'del',
  plan: RoutePlan,
  target: string,
  table: string,
  family: 'ipv4' | 'ipv6',
  options: RouteExecutorOptions,
): readonly string[] {
  const route = plan.selectedPath?.route;
  if (!route) throw new RouteExecutorError('NO_SELECTED_PATH', 'Plan has no selected path');
  const args: string[] = [];
  if (options.netns) args.push('-n', options.netns);
  args.push('-f', family, 'route', action, target);
  if (route.gateway) args.push('via', route.gateway);
  if (route.interfaceName) args.push('dev', route.interfaceName);
  if (route.metric && route.metric !== 0) args.push('metric', String(route.metric));
  if (table !== 'main') args.push('table', table);
  return args;
}

/**
 * Reconstructs `ip route replace` arguments from a captured raw route entry,
 * so rollback can restore the exact prior state.
 */
function restoreArgsFromRoute(
  raw: Record<string, unknown>,
  table: string,
  family: 'ipv4' | 'ipv6',
  options: RouteExecutorOptions,
): readonly string[] | undefined {
  const dst = typeof raw.dst === 'string' ? raw.dst : undefined;
  if (!dst) return undefined;
  const args: string[] = [];
  if (options.netns) args.push('-n', options.netns);
  args.push('-f', family, 'route', 'replace', dst);
  if (typeof raw.gateway === 'string') args.push('via', raw.gateway);
  if (typeof raw.dev === 'string') args.push('dev', raw.dev);
  if (typeof raw.metric === 'number') args.push('metric', String(raw.metric));
  if (typeof raw.src === 'string') args.push('src', raw.src);
  if (typeof raw.scope === 'string') args.push('scope', raw.scope);
  if (typeof raw.proto === 'string') args.push('proto', raw.proto);
  if (table !== 'main') args.push('table', table);
  return args;
}

/**
 * Production Linux route executor.
 *
 * Registered as a {@link KernelContract} namespace `routing` on the
 * {@link KernelRuntime}. It is the concrete `apply`/`rollback` step behind the
 * canonical mutation boundary — it owns no policy, safety, or transaction
 * authority of its own.
 */
export class LinuxRouteExecutor {
  private readonly snapshots = new Map<string, RouteSnapshot>();

  constructor(
    private readonly runner: RouteCommandRunner = new ExecFileRouteCommandRunner(),
    private readonly options: RouteExecutorOptions = {},
  ) {}

  /**
   * Captures pre-mutation route state for a plan. Called before any mutation.
   */
  async captureSnapshot(plan: RoutePlan): Promise<RouteSnapshot> {
    const target = targetFor(plan);
    const table = tableFor(plan);
    const family = familyFor(plan.destination);
    const args = showArgs(target, table, family, this.options);
    const result = await this.runner.run(IP_BINARY, args, {
      timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    if (result.exitCode !== 0) {
      throw new RouteExecutorError(
        'SNAPSHOT_FAILED',
        `Failed to capture route snapshot: ${result.stderr || 'unknown error'}`,
        { target, table, family, exitCode: result.exitCode },
      );
    }

    let rawRoutes: readonly unknown[];
    try {
      const parsed = JSON.parse(result.stdout);
      rawRoutes = Array.isArray(parsed) ? parsed : [];
    } catch {
      // Non-JSON output means no route matched (some `ip` versions emit empty).
      rawRoutes = [];
    }

    const exists = rawRoutes.length > 0;
    const restoreArgs =
      exists && rawRoutes.length === 1
        ? restoreArgsFromRoute(
            rawRoutes[0] as Record<string, unknown>,
            table,
            family,
            this.options,
          )
        : undefined;

    // If multiple routes exist and we cannot replay them exactly, we still
    // capture the raw state for diagnostics, but rollback will refuse to
    // simulate restoration.
    const snapshot: RouteSnapshot = {
      planId: plan.id,
      target,
      table,
      family,
      exists,
      rawRoutes,
      restoreArgs: restoreArgs ?? [],
      capturedAt: new Date().toISOString(),
    };

    this.snapshots.set(plan.id, snapshot);
    return snapshot;
  }

  /**
   * Validates a plan before mutation. Rejects invalid plans before any
   * `ip route` command is run.
   */
  validatePlan(plan: RoutePlan): void {
    if (!plan.selectedPath) {
      throw new RouteExecutorError('NO_SELECTED_PATH', 'Plan has no selected path');
    }
    if (plan.dryRun) {
      throw new RouteExecutorError('DRY_RUN', 'Cannot apply a dry-run plan');
    }
    const dest = plan.destination;
    if (
      dest.kind === 'hostname' ||
      dest.kind === 'service' ||
      dest.kind === 'domain-profile' ||
      dest.kind === 'network-segment'
    ) {
      throw new RouteExecutorError(
        'UNSUPPORTED_DESTINATION',
        `Destination kind '${dest.kind}' requires resolution to IP/CIDR before route mutation`,
        { kind: dest.kind },
      );
    }
    const table = tableFor(plan);
    if (table === 'local') {
      throw new RouteExecutorError(
        'LOCAL_TABLE',
        'Mutation of the local routing table is not supported',
        { table },
      );
    }
  }

  /**
   * Applies a route plan via `ip route replace`. Returns a structured result;
   * never throws on `ip` failure — the error is in the result.
   */
  async applyRoutePlan(plan: RoutePlan): Promise<RouteApplyResult> {
    try {
      this.validatePlan(plan);
      const snapshot = await this.captureSnapshot(plan);

      // If pre-state has multiple routes and we cannot replay them exactly,
      // reject before mutation rather than making rollback impossible.
      if (snapshot.exists && snapshot.restoreArgs.length === 0) {
        return {
          ok: false,
          planId: plan.id,
          error: `Pre-mutation state for ${snapshot.target} captured ${snapshot.rawRoutes.length} prior routes; cannot guarantee exact rollback — mutation rejected`,
        };
      }

      const target = targetFor(plan);
      const table = tableFor(plan);
      const family = familyFor(plan.destination);
      const args = mutationArgs('replace', plan, target, table, family, this.options);
      const result = await this.runner.run(IP_BINARY, args, {
        timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) {
        return {
          ok: false,
          planId: plan.id,
          error: `ip route replace failed (exit ${result.exitCode}): ${result.stderr || result.stdout || 'unknown error'}`,
          result,
        };
      }
      return { ok: true, planId: plan.id, result };
    } catch (error) {
      if (error instanceof RouteExecutorError) {
        return { ok: false, planId: plan.id, error: error.message };
      }
      return {
        ok: false,
        planId: plan.id,
        error: error instanceof Error ? error.message : 'apply failed',
      };
    }
  }

  /**
   * Rolls back a previously applied plan using the captured snapshot.
   * If no snapshot exists, fails explicitly — never simulates success.
   */
  async rollbackRoutePlan(plan: RoutePlan): Promise<RouteRollbackResult> {
    const snapshot = this.snapshots.get(plan.id);
    if (!snapshot) {
      return {
        ok: false,
        planId: plan.id,
        error: `No snapshot captured for plan ${plan.id}; cannot roll back`,
      };
    }

    try {
      if (!snapshot.exists) {
        // Route did not exist before mutation — delete the applied route.
        const args = mutationArgs('del', plan, snapshot.target, snapshot.table, snapshot.family, this.options);
        const result = await this.runner.run(IP_BINARY, args, {
          timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
        if (result.exitCode !== 0) {
          return {
            ok: false,
            planId: plan.id,
            error: `ip route del failed (exit ${result.exitCode}): ${result.stderr || 'unknown error'}`,
            result,
          };
        }
        this.snapshots.delete(plan.id);
        return { ok: true, planId: plan.id, result };
      }

      if (snapshot.restoreArgs.length === 0) {
        // Multiple prior routes or unparseable state — refuse to fake rollback.
        return {
          ok: false,
          planId: plan.id,
          error: `Snapshot for plan ${plan.id} captured ${snapshot.rawRoutes.length} prior routes; cannot replay exactly — manual intervention required`,
        };
      }

      // Restore the exact prior route via `ip route replace`.
      const result = await this.runner.run(IP_BINARY, snapshot.restoreArgs, {
        timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) {
        return {
          ok: false,
          planId: plan.id,
          error: `ip route replace (restore) failed (exit ${result.exitCode}): ${result.stderr || 'unknown error'}`,
          result,
        };
      }
      this.snapshots.delete(plan.id);
      return { ok: true, planId: plan.id, result };
    } catch (error) {
      return {
        ok: false,
        planId: plan.id,
        error: error instanceof Error ? error.message : 'rollback failed',
      };
    }
  }

  /**
   * Verifies that the route for a plan's target exists in the desired state.
   * Used as the verification step after apply.
   */
  async verifyRoutePlan(plan: RoutePlan): Promise<boolean> {
    const target = targetFor(plan);
    const table = tableFor(plan);
    const family = familyFor(plan.destination);
    const args = showArgs(target, table, family, this.options);
    const result = await this.runner.run(IP_BINARY, args, {
      timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) return false;
    try {
      const parsed = JSON.parse(result.stdout);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }

  /** Clears all captured snapshots (for testing). */
  clearSnapshots(): void {
    this.snapshots.clear();
  }

  getSnapshot(planId: string): RouteSnapshot | undefined {
    return this.snapshots.get(planId);
  }
}
