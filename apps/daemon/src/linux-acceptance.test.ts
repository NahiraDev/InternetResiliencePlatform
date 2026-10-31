/**
 * Linux acceptance suite: real processes, real sockets, real kernel routing state.
 *
 * What is REAL here: the daemon and CLI run as separate OS processes from their built output
 * (`dist/`, built by turbo before tests); the control channel is a real Unix socket; restarts are
 * real SIGTERM / SIGKILL; route recovery runs `ip` against a real kernel inside a throwaway
 * network namespace.
 *
 * What is NOT done: nothing here changes the host's default route, DNS, firewall or VPN. The
 * daemon only runs in safe mode against the host namespace, and every mutation scenario runs
 * inside `ip netns exec`. Live mode is started (to check authorization) but never cycled.
 *
 * Requirements are asserted, not skipped: a missing `dist/` or missing privileges for the
 * namespace tests fails loudly so a green run cannot silently mean "nothing was exercised".
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { FileRouteJournal } from '@irp/linux-client';
import { controlRequest } from '@irp/resilience-runtime';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const DAEMON = join(here, '..', 'dist', 'index.js');
const CLI = join(here, '..', '..', 'cli', 'dist', 'index.js');
const NS = 'irp-accept-ns';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

interface Running {
  child: ChildProcess;
  socket: string;
  stateDir: string;
  logs: () => string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

const baseEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  HOME: process.env.HOME ?? '/tmp',
  ...extra,
});

const waitForDaemon = async (socket: string, exited: Running['exited']): Promise<void> => {
  const deadline = Date.now() + 30_000;
  let finished = false;
  void exited.then(() => (finished = true));
  while (Date.now() < deadline) {
    if (finished) throw new Error('daemon exited before becoming ready');
    try {
      await controlRequest(socket, 'GET', '/v1/health', undefined, 2_000);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error('daemon did not become ready within 30s');
};

const startDaemon = async (
  opts: { dir: string; env?: Record<string, string>; wrap?: string[] } ,
): Promise<Running> => {
  expect(existsSync(DAEMON), `${DAEMON} missing: run the build first`).toBe(true);
  const socket = join(opts.dir, 'run', 'irp.sock');
  const stateDir = join(opts.dir, 'state');
  const env = baseEnv({ IRP_STATE_DIR: stateDir, IRP_CONTROL_SOCKET: socket, ...opts.env });
  const [cmd, ...pre] = [...(opts.wrap ?? []), process.execPath, DAEMON];
  const child = spawn(cmd!, pre, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout!.on('data', (c) => (out += c));
  child.stderr!.on('data', (c) => (out += c));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  );
  cleanup.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  });
  const running: Running = { child, socket, stateDir, logs: () => out, exited };
  try {
    await waitForDaemon(socket, exited);
  } catch (error) {
    throw new Error(`${(error as Error).message}\n--- daemon output ---\n${out}`, { cause: error });
  }
  return running;
};

const stop = async (r: Running, signal: NodeJS.Signals): Promise<{ code: number | null; signal: NodeJS.Signals | null }> => {
  r.child.kill(signal);
  return r.exited;
};

const cli = async (socket: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      env: baseEnv({ IRP_CONTROL_SOCKET: socket }),
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
};

const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'irp-accept-'));
  cleanup.push(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

const hostNetworkFingerprint = async (): Promise<string> => {
  const sh = async (cmd: string, args: string[]) => (await execFileAsync(cmd, args, { timeout: 5_000 }).catch(() => ({ stdout: 'n/a' }))).stdout;
  return [
    await sh('ip', ['route', 'show', 'table', 'all']),
    await sh('ip', ['-6', 'route', 'show']),
    await sh('ip', ['-brief', 'address']),
    existsSync('/etc/resolv.conf') ? readFileSync('/etc/resolv.conf', 'utf8') : 'no resolv.conf',
  ].join('\n--\n');
};

beforeAll(() => {
  expect(process.platform, 'the Linux acceptance suite only runs on Linux').toBe('linux');
  expect(existsSync(CLI), `${CLI} missing: run the build first`).toBe(true);
});

describe('real daemon process: lifecycle, socket and CLI', () => {
  it('creates an owner-only socket, answers the CLI, and shuts down cleanly on SIGTERM', async () => {
    const dir = tmp();
    const daemon = await startDaemon({ dir });
    expect(statSync(daemon.socket).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(daemon.socket)).mode & 0o777).toBe(0o700);
    expect(statSync(daemon.stateDir).isDirectory()).toBe(true);

    const doctor = await cli(daemon.socket, ['doctor']);
    const report = JSON.parse(doctor.stdout) as { running: boolean; state: string; authorization: { effectiveMode: string; liveActive: boolean }; storage: { persistent: boolean } };
    expect(report.running).toBe(true);
    expect(report.authorization).toMatchObject({ effectiveMode: 'safe', liveActive: false });
    expect(report.storage.persistent).toBe(true);
    // Fresh daemon: no verified healthy evidence yet, so it must NOT claim healthy.
    expect(report.state).not.toBe('healthy');
    expect(doctor.code).toBe(2);

    const exit = await stop(daemon, 'SIGTERM');
    expect(exit).toEqual({ code: 0, signal: null });
    expect(existsSync(daemon.socket)).toBe(false);
    const after = await cli(daemon.socket, ['status']);
    expect(after.code).toBe(3);
    expect(after.stderr).toMatch(/no daemon is listening/);
  }, 90_000);

  it('runs repeated safe cycles without being blocked and without touching host networking', async () => {
    const dir = tmp();
    const before = await hostNetworkFingerprint();
    const daemon = await startDaemon({ dir });
    for (let i = 0; i < 3; i += 1) {
      const result = await cli(daemon.socket, ['runtime', 'cycle']);
      expect(result.code, result.stderr).toBe(0);
    }
    const decisions = JSON.parse((await cli(daemon.socket, ['runtime', 'decisions'])).stdout) as Array<{ outcome: string; blockedBecause: string[]; execution: string; mode: string }>;
    expect(decisions.length).toBeGreaterThanOrEqual(3);
    for (const d of decisions) {
      expect(d.outcome, JSON.stringify(d)).not.toBe('blocked');
      expect(d.blockedBecause).toEqual([]);
      expect(d.mode).toBe('safe');
      // Safe mode may decide, but never executes a live change.
      expect(['none', 'simulated', 'skipped']).toContain(d.execution);
    }
    expect(await hostNetworkFingerprint()).toBe(before);
    await stop(daemon, 'SIGTERM');
  }, 120_000);

  it('rejects live mode over the socket and serializes concurrent cycle requests', async () => {
    const dir = tmp();
    const daemon = await startDaemon({ dir });
    await expect(controlRequest(daemon.socket, 'POST', '/v1/cycle', { mode: 'live' })).rejects.toMatchObject({ status: 400 });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => controlRequest(daemon.socket, 'POST', '/v1/cycle', { mode: 'safe' }, 60_000)));
    const statuses = results.map((r) => (r.status === 'fulfilled' ? 200 : (r.reason as { status?: number }).status));
    expect(statuses.every((s) => s === 200 || s === 409), JSON.stringify(statuses)).toBe(true);
    expect(statuses).toContain(200);
    const decisions = (await controlRequest(daemon.socket, 'GET', '/v1/decisions')) as unknown[];
    expect(decisions.length).toBe(statuses.filter((s) => s === 200).length);
    await stop(daemon, 'SIGTERM');
  }, 120_000);
});

describe('durable state across restarts', () => {
  it('keeps decisions and incidents after SIGTERM and after SIGKILL, and replaces the stale socket', async () => {
    const dir = tmp();
    const first = await startDaemon({ dir });
    await controlRequest(first.socket, 'POST', '/v1/cycle', { mode: 'safe' }, 60_000);
    const d1 = ((await controlRequest(first.socket, 'GET', '/v1/decisions')) as Array<{ decisionId: string }>).map((d) => d.decisionId);
    const i1 = ((await controlRequest(first.socket, 'GET', '/v1/incidents')) as Array<{ id: string }>).map((i) => i.id);
    expect(d1.length).toBe(1);
    await stop(first, 'SIGTERM');

    const second = await startDaemon({ dir });
    const d2 = ((await controlRequest(second.socket, 'GET', '/v1/decisions')) as Array<{ decisionId: string }>).map((d) => d.decisionId);
    const i2 = ((await controlRequest(second.socket, 'GET', '/v1/incidents')) as Array<{ id: string }>).map((i) => i.id);
    expect(d2).toEqual(expect.arrayContaining(d1));
    expect(i2).toEqual(expect.arrayContaining(i1));
    await controlRequest(second.socket, 'POST', '/v1/cycle', { mode: 'safe' }, 60_000);
    const d2b = ((await controlRequest(second.socket, 'GET', '/v1/decisions')) as unknown[]).length;
    expect(d2b).toBe(d1.length + 1);

    // Hard kill: no shutdown hooks run, the socket file is left behind.
    const killed = await stop(second, 'SIGKILL');
    expect(killed.signal).toBe('SIGKILL');
    expect(existsSync(second.socket)).toBe(true);

    const third = await startDaemon({ dir });
    const d3 = ((await controlRequest(third.socket, 'GET', '/v1/decisions')) as unknown[]).length;
    expect(d3).toBe(d2b);
    await stop(third, 'SIGTERM');
  }, 180_000);

  it('lets a cycle in flight finish and persist before exiting on SIGTERM', async () => {
    const dir = tmp();
    const first = await startDaemon({ dir });
    const inFlight = controlRequest(first.socket, 'POST', '/v1/cycle', { mode: 'safe' }, 60_000);
    await new Promise((r) => setTimeout(r, 80));
    const exit = await stop(first, 'SIGTERM');
    // The request must complete normally (not be cut off) and the daemon must exit cleanly.
    await expect(inFlight).resolves.toBeTruthy();
    expect(exit).toEqual({ code: 0, signal: null });
    const second = await startDaemon({ dir });
    expect(((await controlRequest(second.socket, 'GET', '/v1/decisions')) as unknown[]).length).toBe(1);
    await stop(second, 'SIGTERM');
  }, 90_000);

  it('does not start a second daemon on a live socket', async () => {
    const dir = tmp();
    const first = await startDaemon({ dir });
    const second = spawn(process.execPath, [DAEMON], { env: baseEnv({ IRP_STATE_DIR: first.stateDir, IRP_CONTROL_SOCKET: first.socket }), stdio: 'ignore' });
    const result = await new Promise<number | null>((resolve) => second.once('exit', (code) => resolve(code)));
    cleanup.push(() => undefined);
    // The first daemon must still be serving.
    await expect(controlRequest(first.socket, 'GET', '/v1/health')).resolves.toBeTruthy();
    expect(result).not.toBe(0);
    await stop(first, 'SIGTERM');
  }, 90_000);
});

describe('host authorization for live mode', () => {
  const live = { IRP_RUNTIME_MODE: 'live', IRP_ENABLE_LIVE_ROUTE_MUTATION: 'true' };

  it('refuses to start live without the second opt-in', async () => {
    const dir = tmp();
    const child = spawn(process.execPath, [DAEMON], { env: baseEnv({ IRP_STATE_DIR: join(dir, 's'), IRP_CONTROL_SOCKET: join(dir, 'r', 'irp.sock'), IRP_RUNTIME_MODE: 'live' }), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stderr!.on('data', (c) => (out += c));
    child.stdout!.on('data', (c) => (out += c));
    const code = await new Promise<number | null>((resolve) => child.once('exit', (c) => resolve(c)));
    expect(code).not.toBe(0);
    expect(out).toMatch(/IRP_ENABLE_LIVE_ROUTE_MUTATION/);
  }, 60_000);

  it('degrades to safe and says why when the process lacks CAP_NET_ADMIN', async () => {
    const dir = tmp();
    const daemon = await startDaemon({ dir, env: live, wrap: ['setpriv', '--bounding-set=-net_admin', '--inh-caps=-net_admin'] });
    const health = (await controlRequest(daemon.socket, 'GET', '/v1/health')) as { authorization: { requestedMode: string; effectiveMode: string; liveActive: boolean; blockers: string[]; evidence: { capNetAdmin: boolean } } };
    expect(health.authorization.requestedMode).toBe('live');
    expect(health.authorization.effectiveMode).toBe('safe');
    expect(health.authorization.liveActive).toBe(false);
    expect(health.authorization.evidence.capNetAdmin).toBe(false);
    expect(health.authorization.blockers.join(' ')).toMatch(/CAP_NET_ADMIN/);
    const caps = (await controlRequest(daemon.socket, 'GET', '/v1/capabilities')) as { hostGrantedCapabilities: string[]; adapters: Array<{ declaresLive: boolean; effective: string }> };
    expect(caps.hostGrantedCapabilities).toEqual(['network.observe']);
    // No adapter that merely *declares* live support is reported as live.
    expect(caps.adapters.some((a) => a.declaresLive)).toBe(true);
    expect(caps.adapters.every((a) => a.effective !== 'live-authorized')).toBe(true);
    const doctor = await cli(daemon.socket, ['doctor']);
    expect(JSON.parse(doctor.stdout).findings.map((f: { code: string }) => f.code)).toContain('host-authorization');
    await stop(daemon, 'SIGTERM');
  }, 90_000);

  it('activates live authority only where the host truly holds CAP_NET_ADMIN (no cycle is run)', async () => {
    const dir = tmp();
    const daemon = await startDaemon({ dir, env: live });
    const health = (await controlRequest(daemon.socket, 'GET', '/v1/health')) as { authorization: { effectiveMode: string; liveActive: boolean; hostGrantedCapabilities: string[]; evidence: { capNetAdmin: boolean | null } } };
    if (health.authorization.evidence.capNetAdmin) {
      expect(health.authorization.liveActive).toBe(true);
      expect(health.authorization.hostGrantedCapabilities).toContain('route.write');
    } else {
      expect(health.authorization.liveActive).toBe(false);
    }
    await stop(daemon, 'SIGTERM');
  }, 90_000);
});

describe('DNS restore after an interrupted change (stub resolvectl)', () => {
  // systemd-resolved is not available where this suite runs, so `resolvectl` is a recording stub.
  // This verifies the daemon's own journal-and-restore logic and its sequencing at startup; it is
  // NOT evidence about systemd-resolved behaviour.
  it('restores the recorded original resolvers on start and clears the record', async () => {
    const dir = tmp();
    const bin = join(dir, 'bin');
    const calls = join(dir, 'resolvectl.calls');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'resolvectl'), `#!/bin/sh\necho "$@" >> '${calls}'\n`, { mode: 0o755 });
    const stateDir = join(dir, 'state');
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(stateDir, 'dns-original.json'), JSON.stringify({ schemaVersion: 1, link: 'eth9', servers: ['192.0.2.53', '2001:db8::53'] }));
    const daemon = await startDaemon({ dir, env: { PATH: `${bin}:${process.env.PATH ?? ''}` } });
    expect(readFileSync(calls, 'utf8').trim()).toBe('dns eth9 192.0.2.53 2001:db8::53');
    expect(existsSync(join(stateDir, 'dns-original.json'))).toBe(false);
    const health = (await controlRequest(daemon.socket, 'GET', '/v1/health')) as { recovery: { dnsRestorePending: boolean } };
    expect(health.recovery.dnsRestorePending).toBe(false);
    await stop(daemon, 'SIGTERM');
  }, 90_000);

  it('keeps the record and reports pending when the restore command fails', async () => {
    const dir = tmp();
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'resolvectl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const stateDir = join(dir, 'state');
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(stateDir, 'dns-original.json'), JSON.stringify({ schemaVersion: 1, link: 'eth9', servers: ['192.0.2.53'] }));
    const daemon = await startDaemon({ dir, env: { PATH: `${bin}:${process.env.PATH ?? ''}` } });
    const health = (await controlRequest(daemon.socket, 'GET', '/v1/health')) as { recovery: { dnsRestorePending: boolean } };
    expect(health.recovery.dnsRestorePending).toBe(true);
    expect(existsSync(join(stateDir, 'dns-original.json'))).toBe(true);
    const doctor = await cli(daemon.socket, ['doctor']);
    expect(JSON.parse(doctor.stdout).findings.map((f: { code: string }) => f.code)).toContain('dns-restore-pending');
    await stop(daemon, 'SIGKILL');
  }, 90_000);
});

describe('crash recovery against a real kernel (isolated network namespace)', () => {
  const ipns = (args: string[]) => execFileAsync('ip', ['-n', NS, ...args], { timeout: 5_000 });
  const routes = async () => (await ipns(['route', 'show'])).stdout;

  beforeAll(async () => {
    await execFileAsync('ip', ['netns', 'del', NS]).catch(() => undefined);
    await execFileAsync('ip', ['netns', 'add', NS]);
    await ipns(['link', 'set', 'lo', 'up']);
    await ipns(['link', 'add', 'irp0', 'type', 'dummy']).catch(async () => {
      // Kernels without the dummy module: a veth pair stays entirely inside the namespace.
      await ipns(['link', 'add', 'irp0', 'type', 'veth', 'peer', 'name', 'irp1']);
      await ipns(['link', 'set', 'irp1', 'up']);
    });
    await ipns(['link', 'set', 'irp0', 'up']);
    await ipns(['addr', 'add', '10.99.99.1/24', 'dev', 'irp0']);
  });
  afterAll(async () => {
    await execFileAsync('ip', ['netns', 'del', NS]).catch(() => undefined);
  });

  it('rolls back an unverified mutation and keeps a verified one when the daemon restarts', async () => {
    const dir = tmp();
    const stateDir = join(dir, 'state');
    // Two mutations "issued" before a crash: one never verified, one verified.
    await ipns(['route', 'add', '10.98.0.0/24', 'via', '10.99.99.2', 'dev', 'irp0']);
    await ipns(['route', 'add', '10.97.0.0/24', 'via', '10.99.99.2', 'dev', 'irp0']);
    const journal = new FileRouteJournal(join(stateDir, 'route-journal'));
    const snapshot = (planId: string, target: string) => ({ planId, target, table: 'main', family: 'ipv4' as const, exists: false, rawRoutes: [], restoreArgs: [], capturedAt: new Date().toISOString() });
    journal.write({ schemaVersion: 1, planId: 'plan-unverified', state: 'applying', snapshot: snapshot('plan-unverified', '10.98.0.0/24'), rollbackCommands: [['-n', NS, 'route', 'del', '10.98.0.0/24']], updatedAt: new Date().toISOString() });
    journal.write({ schemaVersion: 1, planId: 'plan-verified', state: 'verified', snapshot: snapshot('plan-verified', '10.97.0.0/24'), rollbackCommands: [['-n', NS, 'route', 'del', '10.97.0.0/24']], updatedAt: new Date().toISOString() });
    expect(await routes()).toContain('10.98.0.0/24');

    const daemon = await startDaemon({ dir });
    const health = (await controlRequest(daemon.socket, 'GET', '/v1/health')) as { recovery: { routeJournalEnabled: boolean; lastStartupRouteRecovery: { rolledBack: string[]; failed: string[]; corrupt: string[] } } };
    expect(health.recovery.routeJournalEnabled).toBe(true);
    expect(health.recovery.lastStartupRouteRecovery.rolledBack).toEqual(['plan-unverified']);
    expect(health.recovery.lastStartupRouteRecovery.failed).toEqual([]);

    const after = await routes();
    expect(after).not.toContain('10.98.0.0/24'); // unverified change really undone in the kernel
    expect(after).toContain('10.97.0.0/24'); // verified change not rolled back
    await stop(daemon, 'SIGTERM');
  }, 90_000);
});
