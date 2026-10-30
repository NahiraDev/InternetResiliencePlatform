/**
 * Real Linux route mutation integration test.
 *
 * This test creates an isolated network namespace, a dummy interface, and
 * performs real `ip route add/replace/del` operations through the
 * {@link LinuxRouteExecutor} — the same production code path used by the
 * daemon.
 *
 * Requirements:
 * - `ip` binary available
 * - CAP_NET_ADMIN (or root) to create namespaces and mutate routes
 * - `/run/netns` writable
 *
 * If any requirement is unavailable, the test is SKIPPED with a documented
 * reason — it is never weakened or replaced with a mock.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRouteJournal } from './route-journal.js';
import {
  LinuxRouteExecutor,
  ExecFileRouteCommandRunner,
} from './linux-route-executor.js';
import type { RoutePlan, DiscoveredRoute } from '@irp/routing';

const execFileAsync = promisify(execFile);

const NS_NAME = 'irp-test-ns';
const DUMMY_DEV = 'irp-test0';
// The interface owns 10.99.99.1/24 (its connected route). The route under test targets a
// different, non-connected prefix through an on-link gateway, so "absent before apply" is
// genuinely true and the connected route is never touched.
const IFACE_ADDR = '10.99.99.1';
const TEST_CIDR = '10.98.0.0/24';
const TEST_GW = '10.99.99.2';

// Check capability synchronously: route mutation requires CAP_NET_ADMIN.
// In this sandbox, CapEff is 0x0 (no capabilities). We detect this by
// checking if process is root or has CAP_NET_ADMIN.
const hasNetAdmin = (() => {
  try {
    const status = readFileSync('/proc/self/status', 'utf8');
    const capLine = status.match(/CapEff:\s+([0-9a-f]+)/i);
    if (!capLine || !capLine[1]) return false;
    const capEff = BigInt(parseInt(capLine[1], 16));
    // CAP_NET_ADMIN is bit 12 (1 << 12 = 4096)
    return (capEff & (1n << 12n)) !== 0n;
  } catch {
    return false;
  }
})();

// Tests that require CAP_NET_ADMIN are skipped (not passed) when unavailable.
const privileged = hasNetAdmin ? describe : describe.skip;

/** Peer end of the veth fallback; lives in the host namespace and is removed with the pair. */
const VETH_PEER = 'irp-test-peer';

async function ip(args: string[]): Promise<void> {
  await execFileAsync('ip', args, { timeout: 3_000 });
}

/**
 * Builds an isolated namespace containing a real interface carrying the gateway
 * address. A `dummy` device is preferred; kernels without the dummy module (common in
 * containers and minimal VMs) fall back to a veth pair, which exercises the same
 * kernel routing code. Nothing is mocked either way.
 */
async function setupNamespace(): Promise<void> {
  await cleanupNamespace();
  await ip(['netns', 'add', NS_NAME]);
  try {
    await ip(['link', 'add', DUMMY_DEV, 'type', 'dummy']);
  } catch {
    await ip(['link', 'add', DUMMY_DEV, 'type', 'veth', 'peer', 'name', VETH_PEER]);
    await ip(['link', 'set', VETH_PEER, 'up']);
  }
  await ip(['link', 'set', DUMMY_DEV, 'netns', NS_NAME]);
  await ip(['-n', NS_NAME, 'link', 'set', DUMMY_DEV, 'up']);
  await ip(['-n', NS_NAME, 'addr', 'add', `${IFACE_ADDR}/24`, 'dev', DUMMY_DEV]);
}

async function cleanupNamespace(): Promise<void> {
  for (const args of [
    ['netns', 'del', NS_NAME],
    ['link', 'del', DUMMY_DEV],
    ['link', 'del', VETH_PEER],
  ]) {
    try {
      await ip(args);
    } catch {
      // Not present; nothing to clean up.
    }
  }
}

function makeRoutePlan(): RoutePlan {
  const route: DiscoveredRoute = {
    destination: '10.98.0.0',
    prefix: 24,
    gateway: TEST_GW,
    interfaceName: DUMMY_DEV,
    metric: 200,
    protocol: 'static',
    table: { id: 'main', kind: 'main', name: 'main' },
    family: 'ipv4',
    scope: 'global',
    state: 'active',
    priority: 0,
    capabilities: ['ipv4'],
    metadata: { pathType: 'direct' },
  };
  const path = {
    id: 'path:test-mutation',
    type: 'direct' as const,
    hops: [TEST_GW],
    route: {
      ...route,
      id: 'route:test-mutation',
    } as never,
    capabilities: ['ipv4'],
    state: 'active' as const,
    metadata: {},
  };
  return {
    id: 'route_plan_mutation_test',
    destination: { kind: 'cidr', value: TEST_CIDR, family: 'ipv4' },
    candidatePaths: [path],
    selectedPath: path,
    reason: 'integration test',
    policy: [],
    actions: [
      {
        type: 'apply-route',
        capability: 'network.route',
        input: {},
        description: 'apply test route in namespace',
      },
    ],
    verification: {
      required: true,
      timeoutMs: 5_000,
      strategy: 'provider',
      status: 'pending',
    },
    explanation: {
      matchedRouteIds: ['route:test-mutation'],
      eligibleCandidateIds: ['candidate:path:test-mutation'],
      rejected: [],
      policy: [],
      scores: {},
      selectedCandidateId: 'candidate:path:test-mutation',
      reason: 'integration test',
      precedence: [],
    },
    dryRun: false,
    createdAt: new Date().toISOString(),
  };
}

privileged('Linux route mutation integration (network namespace)', () => {
  beforeAll(async () => {
    if (hasNetAdmin) {
      await setupNamespace();
    }
  });

  afterAll(async () => {
    if (hasNetAdmin) {
      await cleanupNamespace();
    }
  });

  it('performs real route add/replace/del through the production executor', async () => {

    const executor = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
      netns: NS_NAME,
    });

    const plan = makeRoutePlan();

    // 1. Capture snapshot (should be absent — route doesn't exist yet)
    const snapshot = await executor.captureSnapshot(plan);
    expect(snapshot.exists).toBe(false);

    // 2. Apply the route via ip route replace
    const applyResult = await executor.applyRoutePlan(plan);
    expect(applyResult.ok).toBe(true);

    // 3. Verify the route exists
    const verified = await executor.verifyRoutePlan(plan);
    expect(verified).toBe(true);

    // 4. Rollback — should delete the route (pre-state was absent)
    const rollbackResult = await executor.rollbackRoutePlan(plan);
    expect(rollbackResult.ok).toBe(true);

    // 5. Verify the route is gone
    const verifiedAfterRollback = await executor.verifyRoutePlan(plan);
    expect(verifiedAfterRollback).toBe(false);
  });

  it('captures and restores prior route state on rollback', async () => {

    const executor = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
      netns: NS_NAME,
    });

    // Pre-create a route so the snapshot captures it
    await execFileAsync(
      'ip',
      ['-n', NS_NAME, 'route', 'add', TEST_CIDR, 'dev', DUMMY_DEV, 'metric', '150'],
      { timeout: 3_000 },
    );

    const plan = makeRoutePlan();
    // Change the metric to 200 (different from pre-existing 150)
    const modifiedPlan: RoutePlan = {
      ...plan,
      id: 'route_plan_rollback_test',
      selectedPath: {
        ...plan.selectedPath!,
        route: {
          ...plan.selectedPath!.route,
          metric: 200,
        } as never,
      },
    };

    // 1. Capture snapshot (should find the pre-existing route)
    const snapshot = await executor.captureSnapshot(modifiedPlan);
    expect(snapshot.exists).toBe(true);
    expect(snapshot.restoreArgs).toContain('replace');

    // 2. Apply the modified route
    const applyResult = await executor.applyRoutePlan(modifiedPlan);
    expect(applyResult.ok).toBe(true);

    // The planned route has a different metric, so it coexists with the original until rolled back.
    const applied = (await execFileAsync('ip', ['-n', NS_NAME, 'route', 'show'], { timeout: 3_000 })).stdout;
    expect(applied).toContain(`via ${TEST_GW}`);

    // 3. Rollback — should restore the original route AND remove the applied one
    const rollbackResult = await executor.rollbackRoutePlan(modifiedPlan);
    expect(rollbackResult.ok).toBe(true);
    const restored = (await execFileAsync('ip', ['-n', NS_NAME, 'route', 'show'], { timeout: 3_000 })).stdout;
    expect(restored).not.toContain(`via ${TEST_GW}`);
    expect(restored).toMatch(/10\.98\.0\.0\/24 dev irp-test0 .*metric 150/);

    // 4. Clean up
    try {
      await execFileAsync(
        'ip',
        ['-n', NS_NAME, 'route', 'del', TEST_CIDR, 'dev', DUMMY_DEV],
        { timeout: 3_000 },
      );
    } catch {
      // Already cleaned up
    }
  });

  describe('crash recovery through the on-disk journal', () => {
    const routesIn = async (): Promise<string> =>
      (await execFileAsync('ip', ['-n', NS_NAME, 'route', 'show'], { timeout: 3_000 })).stdout;

    it('removes a route that was applied but never verified before a crash', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'irp-recover-'));
      try {
        const before = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
          netns: NS_NAME,
          journal: new FileRouteJournal(dir),
        });
        const plan = makeRoutePlan();
        expect((await before.applyRoutePlan(plan)).ok).toBe(true);
        expect(await routesIn()).toContain('10.98.0.0/24');

        // Simulated crash: the first executor and all of its memory are gone. Only the journal
        // directory survives, exactly as after a SIGKILL or power loss.
        const after = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
          netns: NS_NAME,
          journal: new FileRouteJournal(dir),
        });
        const report = await after.recoverInterrupted();
        expect(report.rolledBack).toEqual([plan.id]);
        expect(report.failed).toEqual([]);
        expect(await routesIn()).not.toContain('10.98.0.0/24');
        expect(new FileRouteJournal(dir).list().entries).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('restores the exact prior route after a crash mid-change', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'irp-recover-'));
      try {
        await execFileAsync(
          'ip',
          ['-n', NS_NAME, 'route', 'add', TEST_CIDR, 'dev', DUMMY_DEV, 'metric', '150'],
          { timeout: 3_000 },
        );
        const plan = makeRoutePlan();
        const before = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
          netns: NS_NAME,
          journal: new FileRouteJournal(dir),
        });
        expect((await before.applyRoutePlan(plan)).ok).toBe(true);
        expect(await routesIn()).toContain(`via ${TEST_GW}`);

        const after = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
          netns: NS_NAME,
          journal: new FileRouteJournal(dir),
        });
        const report = await after.recoverInterrupted();
        expect(report.rolledBack).toEqual([plan.id]);
        const routes = await routesIn();
        expect(routes).not.toContain(`via ${TEST_GW}`);
        expect(routes).toMatch(/10\.98\.0\.0\/24 dev irp-test0 .*metric 150/);
      } finally {
        await execFileAsync('ip', ['-n', NS_NAME, 'route', 'del', TEST_CIDR], { timeout: 3_000 }).catch(
          () => undefined,
        );
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps a verified change across a restart instead of rolling it back', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'irp-recover-'));
      try {
        const plan = makeRoutePlan();
        const before = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
          netns: NS_NAME,
          journal: new FileRouteJournal(dir),
        });
        expect((await before.applyRoutePlan(plan)).ok).toBe(true);
        expect(await before.verifyRoutePlan(plan)).toBe(true);

        const after = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
          netns: NS_NAME,
          journal: new FileRouteJournal(dir),
        });
        const report = await after.recoverInterrupted();
        expect(report.rolledBack).toEqual([]);
        expect(await routesIn()).toContain('10.98.0.0/24');
        // The retained snapshot still allows an explicit, later rollback by plan id.
        expect((await after.rollbackRoutePlan(plan)).ok).toBe(true);
        expect(await routesIn()).not.toContain('10.98.0.0/24');
      } finally {
        await execFileAsync('ip', ['-n', NS_NAME, 'route', 'del', TEST_CIDR], { timeout: 3_000 }).catch(
          () => undefined,
        );
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not report success when a different route already occupies the prefix', async () => {
      const executor = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), { netns: NS_NAME });
      await execFileAsync(
        'ip',
        ['-n', NS_NAME, 'route', 'add', TEST_CIDR, 'dev', DUMMY_DEV, 'metric', '150'],
        { timeout: 3_000 },
      );
      try {
        // The plan wants the prefix via TEST_GW; the unrelated direct route must not satisfy it.
        expect(await executor.verifyRoutePlan(makeRoutePlan())).toBe(false);
      } finally {
        await execFileAsync('ip', ['-n', NS_NAME, 'route', 'del', TEST_CIDR], { timeout: 3_000 });
      }
    });
  });
});
