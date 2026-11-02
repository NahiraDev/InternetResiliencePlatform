/**
 * Real Linux destination-reachability probe.
 *
 * Implements the `verifyDestination` hook of {@link CanonicalNetworkControlPlane}: after a route
 * mutation, the canonical adapter asks "can the destination actually be reached now?". A route that
 * exists in the kernel table proves nothing about that, so this probe opens a real TCP connection
 * to the destination and reports what the kernel and the network did with it.
 *
 * This is NOT a second verification authority. It is the concrete data-plane probe behind the one
 * canonical hook; the adapter and the privileged mutation boundary still decide what a result
 * means (only `reachable` counts as success, everything else fails closed in live mode).
 *
 * Safety properties:
 *
 * - Uses `execFile` with a fixed script and validated arguments, never a shell string.
 * - Only IP-literal destinations are probed. A hostname would need a resolver, and resolving
 *   through the system resolver could itself touch DNS state; that is reported as `unknown`.
 * - The probe is read-only: it opens one TCP connection and closes it. It mutates no routes,
 *   addresses, DNS or firewall state.
 * - A probe that cannot run (missing `ip`, missing privilege for `ip netns exec`) is reported as
 *   `unknown` with the cause. It is never reported as `reachable`.
 *
 * With `netns` set the connection is made from inside that network namespace, so the result
 * reflects that namespace's routing table. Without it the connection is made from the host
 * namespace, i.e. exactly the table the daemon mutates in production.
 */

import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import type { CanonicalDestinationOutcome, RuntimeContext } from '@irp/resilience-runtime';
import type { RoutingDestination } from '@irp/routing';

const execFileAsync = promisify(execFile);

export const DEFAULT_PROBE_TIMEOUT_MS = 2_000;
const MIN_PROBE_TIMEOUT_MS = 100;
const MAX_PROBE_TIMEOUT_MS = 30_000;
/** Extra wall-clock allowance for the probe child to start, connect and report. */
const PROBE_PROCESS_SLACK_MS = 3_000;
const NETNS_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

/**
 * Fixed probe program executed by the child `node` process. It receives `host port timeoutMs` as
 * argv, makes one TCP connection and prints exactly one JSON line describing the outcome. It is a
 * constant: no caller-controlled text is ever interpolated into it.
 */
export const TCP_PROBE_SCRIPT = [
  "const net = require('node:net');",
  'const [host, port, timeoutMs] = process.argv.slice(1);',
  'const started = process.hrtime.bigint();',
  'const finish = (outcome, code) => {',
  '  const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;',
  "  process.stdout.write(JSON.stringify({ outcome, code, latencyMs }) + '\\n');",
  '  process.exit(0);',
  '};',
  'const socket = net.connect({ host, port: Number(port) });',
  'socket.setTimeout(Number(timeoutMs));',
  "socket.once('connect', () => finish('connected'));",
  "socket.once('timeout', () => finish('timeout', 'ETIMEDOUT'));",
  "socket.once('error', (error) => {",
  '  const code = error && error.code;',
  "  if (code === 'ECONNREFUSED') return finish('refused', code);",
  "  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ENETDOWN')",
  "    return finish('unreachable', code);",
  "  return finish('error', code || 'UNKNOWN');",
  '});',
].join('\n');

/** What the TCP connection attempt did. `unavailable` means the probe itself could not run. */
export type TcpProbeOutcome =
  | 'connected'
  | 'refused'
  | 'timeout'
  | 'unreachable'
  | 'error'
  | 'unavailable';

export interface TcpProbeResult {
  readonly outcome: TcpProbeOutcome;
  readonly host: string;
  readonly port: number;
  readonly latencyMs: number;
  /** errno-style code from the connection attempt, or the cause when `unavailable`. */
  readonly code?: string;
  readonly detail?: string;
}

/** Result of running one external command; never throws. */
export interface ProbeCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  /** Spawn-level error code such as `ENOENT` when the binary could not be started. */
  readonly errorCode?: string;
  readonly timedOut: boolean;
}

/** Pluggable runner so the mapping logic can be unit tested without spawning processes. */
export interface ProbeCommandRunner {
  run(file: string, args: readonly string[], options: { timeoutMs: number }): Promise<ProbeCommandResult>;
}

export class ExecFileProbeCommandRunner implements ProbeCommandRunner {
  async run(
    file: string,
    args: readonly string[],
    options: { timeoutMs: number },
  ): Promise<ProbeCommandResult> {
    try {
      const result = await execFileAsync(file, [...args], {
        timeout: options.timeoutMs,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0, timedOut: false };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        killed?: boolean;
        signal?: string;
      };
      return {
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? failure.message ?? 'command failed',
        exitCode: typeof failure.code === 'number' ? failure.code : 1,
        ...(typeof failure.code === 'string' ? { errorCode: failure.code } : {}),
        timedOut: failure.killed === true || failure.signal === 'SIGTERM',
      };
    }
  }
}

export interface LinuxDestinationProbeOptions {
  /** Run the connection from inside this network namespace (via `ip netns exec`). */
  readonly netns?: string;
  /** Default TCP port of the controlled probe service; a destination's own port wins. */
  readonly port: number;
  /** Per-connection timeout. Clamped to 100..30000 ms. Default 2000. */
  readonly timeoutMs?: number;
  readonly runner?: ProbeCommandRunner;
  /** Path of the Node.js binary used to run the probe program. Defaults to the current one. */
  readonly nodeBinary?: string;
}

function assertValidPort(port: number, label: string): void {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError(`${label} must be an integer between 1 and 65535, received ${String(port)}`);
  }
}

function clampTimeout(timeoutMs: number | undefined): number {
  const requested = timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  if (!Number.isFinite(requested)) return DEFAULT_PROBE_TIMEOUT_MS;
  return Math.min(MAX_PROBE_TIMEOUT_MS, Math.max(MIN_PROBE_TIMEOUT_MS, Math.trunc(requested)));
}

/** TCP probe that connects from the host namespace or from a named network namespace. */
export class LinuxTcpDestinationProbe {
  private readonly runner: ProbeCommandRunner;
  private readonly timeoutMs: number;
  private readonly nodeBinary: string;

  constructor(private readonly options: LinuxDestinationProbeOptions) {
    assertValidPort(options.port, 'probe port');
    if (options.netns !== undefined && !NETNS_NAME_PATTERN.test(options.netns)) {
      throw new RangeError(`invalid network namespace name '${options.netns}'`);
    }
    this.runner = options.runner ?? new ExecFileProbeCommandRunner();
    this.timeoutMs = clampTimeout(options.timeoutMs);
    this.nodeBinary = options.nodeBinary ?? process.execPath;
  }

  /** Opens one TCP connection to `host:port` and reports what happened. Never throws. */
  async probe(host: string, port: number = this.options.port): Promise<TcpProbeResult> {
    const base = { host, port };
    if (isIP(host) === 0) {
      return {
        ...base,
        outcome: 'unavailable',
        latencyMs: 0,
        code: 'INVALID_HOST',
        detail: `'${host}' is not an IP literal`,
      };
    }
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      return {
        ...base,
        outcome: 'unavailable',
        latencyMs: 0,
        code: 'INVALID_PORT',
        detail: `'${String(port)}' is not a valid TCP port`,
      };
    }

    const probeArgs = ['-e', TCP_PROBE_SCRIPT, host, String(port), String(this.timeoutMs)];
    const [file, args] =
      this.options.netns !== undefined
        ? (['ip', ['netns', 'exec', this.options.netns, this.nodeBinary, ...probeArgs]] as const)
        : ([this.nodeBinary, probeArgs] as const);

    const started = Date.now();
    const result = await this.runner.run(file, args, {
      timeoutMs: this.timeoutMs + PROBE_PROCESS_SLACK_MS,
    });
    const elapsedMs = Date.now() - started;

    if (result.errorCode === 'ENOENT') {
      return {
        ...base,
        outcome: 'unavailable',
        latencyMs: elapsedMs,
        code: 'ENOENT',
        detail: `'${file}' is not installed; the destination cannot be probed`,
      };
    }
    if (result.timedOut) {
      return {
        ...base,
        outcome: 'unavailable',
        latencyMs: elapsedMs,
        code: 'PROBE_TIMEOUT',
        detail: 'the probe process did not finish within its deadline',
      };
    }

    const line = result.stdout
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('{'));
    if (result.exitCode !== 0 || line === undefined) {
      // `ip netns exec` fails with a non-zero status and a stderr message when the namespace is
      // missing or the caller lacks CAP_SYS_ADMIN; surface that instead of guessing.
      return {
        ...base,
        outcome: 'unavailable',
        latencyMs: elapsedMs,
        code: 'PROBE_FAILED',
        detail: (result.stderr || result.stdout || `exit ${result.exitCode}`).trim().slice(0, 300),
      };
    }

    try {
      const parsed = JSON.parse(line) as { outcome?: unknown; code?: unknown; latencyMs?: unknown };
      const outcome = parsed.outcome;
      if (
        outcome !== 'connected' &&
        outcome !== 'refused' &&
        outcome !== 'timeout' &&
        outcome !== 'unreachable' &&
        outcome !== 'error'
      ) {
        throw new Error(`unexpected probe outcome '${String(outcome)}'`);
      }
      return {
        ...base,
        outcome,
        latencyMs: typeof parsed.latencyMs === 'number' ? parsed.latencyMs : elapsedMs,
        ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
      };
    } catch (error) {
      return {
        ...base,
        outcome: 'unavailable',
        latencyMs: elapsedMs,
        code: 'PROBE_OUTPUT_INVALID',
        detail: error instanceof Error ? error.message : 'unparseable probe output',
      };
    }
  }

  /**
   * The `verifyDestination` implementation for {@link CanonicalNetworkControlPlane}.
   *
   * Mapping:
   * - connected                          -> `reachable`
   * - refused (a host answered with RST) -> `degraded`: the path works, the service does not
   * - timeout / unreachable / error      -> `failed`
   * - the probe could not run            -> `unknown`
   *
   * Only `reachable` is treated as success by the canonical adapter.
   */
  readonly verifyDestination = async (
    destination: RoutingDestination,
    _context: RuntimeContext,
  ): Promise<CanonicalDestinationOutcome> => {
    if (destination.kind !== 'ip' && !(destination.kind === 'hostname' && isIP(destination.value) !== 0)) {
      return {
        status: 'unknown',
        reason: `destination kind '${destination.kind}' cannot be probed: an IP address is required`,
      };
    }
    const port = destination.port ?? this.options.port;
    const result = await this.probe(destination.value, port);
    const target = `${result.host}:${result.port}`;
    switch (result.outcome) {
      case 'connected':
        return { status: 'reachable', latencyMs: result.latencyMs, service: target };
      case 'refused':
        return {
          status: 'degraded',
          latencyMs: result.latencyMs,
          service: target,
          reason: `${target} answered but refused the connection; the path is up and the service is not`,
        };
      case 'timeout':
      case 'unreachable':
      case 'error':
        return {
          status: 'failed',
          latencyMs: result.latencyMs,
          service: target,
          reason: `${target} is not reachable (${result.outcome}${result.code ? `: ${result.code}` : ''})`,
        };
      case 'unavailable':
        return {
          status: 'unknown',
          service: target,
          reason: `destination probe could not run (${result.code ?? 'unknown'}): ${result.detail ?? 'no detail'}`,
        };
    }
  };
}

/** Convenience factory returning just the `verifyDestination` function. */
export function createLinuxDestinationVerifier(
  options: LinuxDestinationProbeOptions,
): LinuxTcpDestinationProbe['verifyDestination'] {
  return new LinuxTcpDestinationProbe(options).verifyDestination;
}
