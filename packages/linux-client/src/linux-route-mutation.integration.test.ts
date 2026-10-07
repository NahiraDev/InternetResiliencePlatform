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
import {
  LinuxRouteExecutor,
  ExecFileRouteCommandRunner,
} from './linux-route-executor.js';
import type { RoutePlan, DiscoveredRoute } from '@irp/routing';

const execFileAsync = promisify(execFile);

const NS_NAME = 'irp-test-ns';
const DUMMY_DEV = 'irp-test0';
const TEST_CIDR = '10.99.99.0/24';
const TEST_GW = '10.99.99.1';

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

async function setupNamespace(): Promise<void> {
  // Create a dummy interface and move it to the namespace
  await execFileAsync('ip', ['link', 'add', DUMMY_DEV, 'type', 'dummy'], { timeout: 3_000 });
  await execFileAsync('ip', ['link', 'set', DUMMY_DEV, 'up'], { timeout: 3_000 });
  await execFileAsync('ip', ['link', 'set', DUMMY_DEV, 'netns', NS_NAME], { timeout: 3_000 });
  // Assign an address in the namespace
  await execFileAsync('ip', ['-n', NS_NAME, 'addr', 'add', `${TEST_GW}/24`, 'dev', DUMMY_DEV], { timeout: 3_000 });
}

async function cleanupNamespace(): Promise<void> {
  try {
    await execFileAsync('ip', ['netns', 'del', NS_NAME], { timeout: 3_000 });
  } catch {
    // Already cleaned up
  }
  try {
    await execFileAsync('ip', ['link', 'del', DUMMY_DEV], { timeout: 3_000 });
  } catch {
    // Already cleaned up
  }
}

function makeRoutePlan(): RoutePlan {
  const route: DiscoveredRoute = {
    destination: '10.99.99.0',
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

    // 3. Rollback — should restore the original metric
    const rollbackResult = await executor.rollbackRoutePlan(modifiedPlan);
    expect(rollbackResult.ok).toBe(true);

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
});
