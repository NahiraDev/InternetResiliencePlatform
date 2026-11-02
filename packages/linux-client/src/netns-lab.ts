/**
 * Isolated two-namespace lab for end-to-end Linux verification.
 *
 *   irp-e2e-src (device under control)            irp-e2e-dst (the destination host)
 *   vsrc0 10.99.1.1/24  <-- veth pair -->  vdst0 10.99.1.2/24
 *                                           lo   10.98.0.10/32  + TCP listener
 *
 * Everything lives in two throwaway named network namespaces. The host namespace is never
 * addressed: no `ip` command here runs without `-n <ns>` / `netns exec` after the namespaces are
 * created, so the host's default route, addresses, DNS and firewall are untouched. The veth ends
 * are created inside the namespaces directly (`ip link add ... netns`), so nothing transits the
 * host namespace either.
 *
 * Capability gaps are reported, not hidden: {@link detectNetnsLabSupport} returns the exact
 * missing requirements so a caller can fail loudly or skip with a stated reason.
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const LAB_SRC_NS = 'irp-e2e-src';
export const LAB_DST_NS = 'irp-e2e-dst';
export const LAB_SRC_DEV = 'vsrc0';
export const LAB_DST_DEV = 'vdst0';
export const LAB_SRC_ADDR = '10.99.1.1';
export const LAB_DST_LINK_ADDR = '10.99.1.2';
/** The destination under test: a /32 on the destination namespace's loopback. */
export const LAB_DESTINATION = '10.98.0.10';

const CAP_NET_ADMIN_BIT = 12n;
const CAP_SYS_ADMIN_BIT = 21n;

export interface NetnsLabSupport {
  readonly supported: boolean;
  /** One human-readable reason per missing requirement; empty when supported. */
  readonly reasons: readonly string[];
}

const run = async (file: string, args: readonly string[], timeoutMs = 5_000) =>
  execFileAsync(file, [...args], { timeout: timeoutMs, maxBuffer: 1024 * 1024 });

/** Runs `ip` and returns stdout; throws with the stderr text on failure. */
export const ip = async (args: readonly string[]): Promise<string> => {
  try {
    return (await run('ip', args)).stdout;
  } catch (error) {
    const failure = error as { stderr?: string; message?: string };
    throw new Error(`ip ${args.join(' ')} failed: ${(failure.stderr || failure.message || '').trim()}`, {
      cause: error,
    });
  }
};

/** Best-effort namespace/link removal. Absence is fine; this is cleanup, not an assertion. */
const quietly = async (args: readonly string[]): Promise<void> => {
  try {
    await run('ip', args);
  } catch {
    /* already gone */
  }
};

/**
 * Establishes, by actually trying, whether this process can build the lab. Static checks (platform,
 * `ip`, CAP_NET_ADMIN, CAP_SYS_ADMIN) come first so the reasons are specific; a real create/delete
 * of a throwaway namespace and in-namespace veth pair then proves the kernel allows it.
 */
export async function detectNetnsLabSupport(): Promise<NetnsLabSupport> {
  const reasons: string[] = [];
  if (process.platform !== 'linux') {
    return { supported: false, reasons: [`network namespaces require Linux, not ${process.platform}`] };
  }

  let ipAvailable = true;
  try {
    await run('ip', ['-V']);
  } catch {
    ipAvailable = false;
    reasons.push('the `ip` (iproute2) binary is not installed or not on PATH');
  }

  try {
    const match = /^CapEff:\s*([0-9a-fA-F]+)\s*$/m.exec(readFileSync('/proc/self/status', 'utf8'));
    if (!match?.[1]) {
      reasons.push('cannot read CapEff from /proc/self/status, so privileges cannot be confirmed');
    } else {
      const caps = BigInt(`0x${match[1]}`);
      if ((caps & (1n << CAP_NET_ADMIN_BIT)) === 0n) reasons.push('the process lacks CAP_NET_ADMIN');
      if ((caps & (1n << CAP_SYS_ADMIN_BIT)) === 0n) {
        reasons.push('the process lacks CAP_SYS_ADMIN (needed to create named network namespaces)');
      }
    }
  } catch {
    reasons.push('cannot read /proc/self/status, so privileges cannot be confirmed');
  }

  if (ipAvailable && reasons.length === 0) {
    const probe = `irp-cap-${process.pid}`;
    try {
      await ip(['netns', 'add', probe]);
      await ip(['-n', probe, 'link', 'add', 'p0', 'type', 'veth', 'peer', 'name', 'p1']);
    } catch (error) {
      reasons.push(
        `the kernel refused to create a namespace or veth pair: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await quietly(['netns', 'del', probe]);
    }
  }
  return { supported: reasons.length === 0, reasons };
}

export interface NetnsLab {
  readonly srcNs: string;
  readonly dstNs: string;
  readonly destination: string;
  readonly port: number;
  /** Runs `ip -n <srcNs> ...` and returns stdout. */
  inSrc(args: readonly string[]): Promise<string>;
  /** Routes the source namespace currently has for the destination (exact /32 only). */
  destinationRoutes(): Promise<readonly Record<string, unknown>[]>;
  /** Starts (or restarts) the TCP listener in the destination namespace. */
  startListener(): Promise<void>;
  /** Stops the listener so the destination refuses connections while its route stays valid. */
  stopListener(): Promise<void>;
  teardown(): Promise<void>;
}

/** Fixed listener program: accepts and closes connections, announces readiness on stdout. */
const LISTENER_SCRIPT = [
  "const net = require('node:net');",
  'const [host, port] = process.argv.slice(1);',
  'const server = net.createServer((socket) => socket.end());',
  "server.listen(Number(port), host, () => process.stdout.write('ready\\n'));",
  "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
].join('\n');

/** Picks a free-ish high port deterministically per process to avoid collisions between runs. */
const labPort = (): number => 20_000 + (process.pid % 20_000);

export async function createNetnsLab(): Promise<NetnsLab> {
  const port = labPort();
  let listener: ChildProcess | undefined;

  const teardown = async (): Promise<void> => {
    if (listener && listener.exitCode === null && listener.signalCode === null) listener.kill('SIGKILL');
    listener = undefined;
    // Deleting a namespace destroys its veth end, which destroys the peer with it.
    await quietly(['netns', 'del', LAB_SRC_NS]);
    await quietly(['netns', 'del', LAB_DST_NS]);
  };

  try {
    await teardown(); // leftovers from an interrupted earlier run
    await ip(['netns', 'add', LAB_SRC_NS]);
    await ip(['netns', 'add', LAB_DST_NS]);
    // Create the pair directly inside the source namespace, then move one end across, so the host
    // namespace never holds either interface.
    await ip(['-n', LAB_SRC_NS, 'link', 'add', LAB_SRC_DEV, 'type', 'veth', 'peer', 'name', LAB_DST_DEV, 'netns', LAB_DST_NS]);
    await ip(['-n', LAB_SRC_NS, 'link', 'set', 'lo', 'up']);
    await ip(['-n', LAB_DST_NS, 'link', 'set', 'lo', 'up']);
    await ip(['-n', LAB_SRC_NS, 'addr', 'add', `${LAB_SRC_ADDR}/24`, 'dev', LAB_SRC_DEV]);
    await ip(['-n', LAB_DST_NS, 'addr', 'add', `${LAB_DST_LINK_ADDR}/24`, 'dev', LAB_DST_DEV]);
    await ip(['-n', LAB_DST_NS, 'addr', 'add', `${LAB_DESTINATION}/32`, 'dev', 'lo']);
    await ip(['-n', LAB_SRC_NS, 'link', 'set', LAB_SRC_DEV, 'up']);
    await ip(['-n', LAB_DST_NS, 'link', 'set', LAB_DST_DEV, 'up']);
  } catch (error) {
    await teardown();
    throw error;
  }

  const startListener = async (): Promise<void> => {
    if (listener && listener.exitCode === null && listener.signalCode === null) return;
    const child = spawn(
      'ip',
      ['netns', 'exec', LAB_DST_NS, process.execPath, '-e', LISTENER_SCRIPT, LAB_DESTINATION, String(port)],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    listener = child;
    let stderr = '';
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`listener not ready within 5s: ${stderr}`)), 5_000);
      child.stdout?.on('data', (chunk) => {
        if (String(chunk).includes('ready')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`listener exited early (code ${String(code)}): ${stderr}`));
      });
    });
  };

  const stopListener = async (): Promise<void> => {
    const child = listener;
    listener = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGKILL');
    await exited;
  };

  return {
    srcNs: LAB_SRC_NS,
    dstNs: LAB_DST_NS,
    destination: LAB_DESTINATION,
    port,
    inSrc: (args) => ip(['-n', LAB_SRC_NS, ...args]),
    destinationRoutes: async () => {
      const out = await ip(['-n', LAB_SRC_NS, '-j', '-f', 'inet', 'route', 'show', 'table', 'main', `${LAB_DESTINATION}/32`]);
      const parsed: unknown = JSON.parse(out || '[]');
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    },
    startListener,
    stopListener,
    teardown,
  };
}
