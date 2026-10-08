/**
 * Unit/contract tests for the Linux route executor.
 *
 * These tests exercise the executor logic with a fake command runner, proving:
 * - Snapshot capture before mutation
 * - Route plan validation (rejects invalid plans)
 * - Apply via `ip route replace`
 * - Rollback restores prior state
 * - Failure propagation (non-zero exit = failure)
 * - Missing snapshot on rollback fails explicitly
 *
 * The production executor code is identical to the real path — only the
 * command runner boundary is mocked.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  LinuxRouteExecutor,
  type RouteCommandRunner,
  type RouteCommandResult,
} from './linux-route-executor.js';
import type { RoutePlan, DiscoveredRoute, Route } from '@irp/routing';

/** Fake command runner that records calls and returns configured results. */
class FakeCommandRunner implements RouteCommandRunner {
  readonly calls: { binary: string; args: readonly string[] }[] = [];
  private results: Map<string, RouteCommandResult> = new Map();
  private defaultResult: RouteCommandResult = {
    command: 'ip',
    args: [],
    stdout: '',
    stderr: '',
    exitCode: 0,
    timedOut: false,
  };

  /**
   * Sets a result that matches when the args contain the action verb
   * (show/replace/add/del) AND optionally a target keyword.
   */
  setResult(action: string, target: string, result: Partial<RouteCommandResult>): void {
    const key = `${action}:${target}`;
    this.results.set(key, {
      ...this.defaultResult,
      ...result,
      args: [],
      command: 'ip',
    });
  }

  async run(
    binary: string,
    args: readonly string[],
    _options: { timeoutMs: number },
  ): Promise<RouteCommandResult> {
    this.calls.push({ binary, args });
    const argsStr = args.join(' ');
    // Match by action verb first (show/replace/add/del), then by target
    const action = args.includes('show') ? 'show' : args.includes('replace') ? 'replace' : args.includes('add') ? 'add' : args.includes('del') ? 'del' : 'other';
    for (const [key, result] of this.results) {
      const [matchAction, matchTarget] = key.split(':');
      if (action === matchAction && matchTarget !== undefined && argsStr.includes(matchTarget)) {
        return { ...result, args, command: binary };
      }
    }
    return { ...this.defaultResult, args, command: binary };
  }

  reset(): void {
    this.calls.length = 0;
    this.results.clear();
  }
}

function makeRoute(overrides: Partial<DiscoveredRoute> = {}): Route {
  const base: Route = {
    id: 'route-1',
    destination: '0.0.0.0/0',
    prefix: 0,
    gateway: '10.0.0.1',
    interfaceName: 'eth0',
    metric: 100,
    protocol: 'static',
    table: { id: 'main', kind: 'main', name: 'main' },
    family: 'ipv4',
    scope: 'global',
    state: 'active',
    priority: 0,
    capabilities: ['ipv4'],
    metadata: { pathType: 'direct' },
  };
  return { ...base, ...overrides } as Route;
}

function makePlan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  const route = makeRoute();
  const path = {
    id: 'path:test',
    type: 'direct' as const,
    hops: ['10.0.0.1'],
    route,
    capabilities: ['ipv4'],
    state: 'active' as const,
    metadata: {},
  };
  return {
    id: 'route_plan_test',
    destination: { kind: 'default', value: 'default', family: 'ipv4' },
    candidatePaths: [path],
    selectedPath: path,
    reason: 'test plan',
    policy: [],
    actions: [
      {
        type: 'apply-route',
        capability: 'network.route',
        input: {},
        description: 'apply selected route',
      },
    ],
    verification: {
      required: true,
      timeoutMs: 5000,
      strategy: 'provider',
      status: 'pending',
    },
    explanation: {
      matchedRouteIds: [route.id ?? 'route-1'],
      eligibleCandidateIds: ['candidate:path:test'],
      rejected: [],
      policy: [],
      scores: {},
      selectedCandidateId: 'candidate:path:test',
      reason: 'test',
      precedence: [],
    },
    dryRun: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LinuxRouteExecutor', () => {
  let runner: FakeCommandRunner;
  let executor: LinuxRouteExecutor;

  beforeEach(() => {
    runner = new FakeCommandRunner();
    executor = new LinuxRouteExecutor(runner);
  });

  describe('validatePlan', () => {
    it('rejects a plan with no selected path', () => {
      const plan = makePlan({ selectedPath: undefined });
      expect(() => executor.validatePlan(plan)).toThrow('no selected path');
    });

    it('rejects a dry-run plan', () => {
      const plan = makePlan({ dryRun: true });
      expect(() => executor.validatePlan(plan)).toThrow('dry-run');
    });

    it('rejects a hostname destination (requires resolution)', () => {
      const plan = makePlan({
        destination: { kind: 'hostname', value: 'example.com' },
      });
      expect(() => executor.validatePlan(plan)).toThrow('requires resolution');
    });

    it('rejects mutation of the local table', () => {
      const baseRoute = makeRoute();
      const plan = makePlan({
        selectedPath: {
          ...makePlan().selectedPath!,
          route: {
            ...baseRoute,
            table: { id: 'local', kind: 'local', name: 'local' },
          },
        },
      });
      expect(() => executor.validatePlan(plan)).toThrow('local routing table');
    });
  });

  describe('captureSnapshot', () => {
    it('captures pre-mutation state when route exists', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', {
        stdout: JSON.stringify([
          {
            dst: 'default',
            gateway: '10.0.0.1',
            dev: 'eth0',
            metric: 100,
          },
        ]),
      });

      const snapshot = await executor.captureSnapshot(plan);

      expect(snapshot.exists).toBe(true);
      expect(snapshot.target).toBe('default');
      expect(snapshot.table).toBe('main');
      expect(snapshot.family).toBe('ipv4');
      expect(snapshot.restoreArgs).toContain('replace');
      expect(snapshot.restoreArgs).toContain('default');
      expect(snapshot.restoreArgs).toContain('via');
      expect(snapshot.restoreArgs).toContain('10.0.0.1');
    });

    it('captures absent state when route does not exist', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', {
        stdout: '[]',
      });

      const snapshot = await executor.captureSnapshot(plan);

      expect(snapshot.exists).toBe(false);
      expect(snapshot.restoreArgs).toEqual([]);
    });

    it('throws on snapshot command failure', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', {
        stdout: '',
        stderr: 'permission denied',
        exitCode: 1,
      });

      await expect(executor.captureSnapshot(plan)).rejects.toThrow('snapshot');
    });
  });

  describe('applyRoutePlan', () => {
    it('applies a route via ip route replace', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', { stdout: '[]' });
      // The apply command (replace) should succeed
      runner.setResult('replace', 'default', {
        stdout: '',
        exitCode: 0,
      });

      const result = await executor.applyRoutePlan(plan);

      expect(result.ok).toBe(true);
      expect(result.planId).toBe(plan.id);

      // Verify the apply command was called
      const applyCall = runner.calls.find((c) => c.args.includes('replace'));
      expect(applyCall).toBeDefined();
      expect(applyCall!.args).toContain('route');
      expect(applyCall!.args).toContain('default');
      expect(applyCall!.args).toContain('via');
      expect(applyCall!.args).toContain('10.0.0.1');
    });

    it('captures a snapshot before applying', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', {
        stdout: JSON.stringify([
          { dst: 'default', gateway: '10.0.0.1', dev: 'eth0', metric: 100 },
        ]),
      });
      runner.setResult('replace', 'default', { stdout: '', exitCode: 0 });

      await executor.applyRoutePlan(plan);

      // The first call should be a `show` (snapshot), then `replace` (apply)
      const showCall = runner.calls.find((c) => c.args.includes('show'));
      expect(showCall).toBeDefined();
      const snapshot = executor.getSnapshot(plan.id);
      expect(snapshot).toBeDefined();
      expect(snapshot!.exists).toBe(true);
    });

    it('reports failure when ip route replace fails', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', { stdout: '[]' });
      runner.setResult('replace', 'default', {
        stdout: '',
        stderr: 'RTNETLINK answers: Operation not permitted',
        exitCode: 2,
      });

      const result = await executor.applyRoutePlan(plan);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('failed');
      expect(result.error).toContain('Operation not permitted');
    });

    it('rejects invalid plans before mutation', async () => {
      const plan = makePlan({ selectedPath: undefined });

      const result = await executor.applyRoutePlan(plan);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('no selected path');
      // No ip commands should have been run
      expect(runner.calls).toHaveLength(0);
    });
  });

  describe('rollbackRoutePlan', () => {
    it('restores prior route state from snapshot', async () => {
      const plan = makePlan();
      // Pre-mutation: route exists with gateway 10.0.0.1
      runner.setResult('show', 'default', {
        stdout: JSON.stringify([
          { dst: 'default', gateway: '10.0.0.1', dev: 'eth0', metric: 100 },
        ]),
      });
      runner.setResult('replace', 'default', { stdout: '', exitCode: 0 });

      // Apply first to capture snapshot
      await executor.applyRoutePlan(plan);

      // Now rollback
      const rollbackResult = await executor.rollbackRoutePlan(plan);

      expect(rollbackResult.ok).toBe(true);

      // Should have called `replace` to restore
      const restoreCall = runner.calls
        .filter((c) => c.args.includes('replace'))
        .find((c) => c.args.includes('default'));
      expect(restoreCall).toBeDefined();
    });

    it('deletes route when pre-mutation state was absent', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', { stdout: '[]' });
      runner.setResult('replace', 'default', { stdout: '', exitCode: 0 });

      await executor.applyRoutePlan(plan);

      // Now rollback should delete the route
      runner.setResult('del', 'default', { stdout: '', exitCode: 0 });
      const rollbackResult = await executor.rollbackRoutePlan(plan);

      expect(rollbackResult.ok).toBe(true);
      const delCall = runner.calls.find((c) => c.args.includes('del'));
      expect(delCall).toBeDefined();
    });

    it('fails explicitly when no snapshot exists', async () => {
      const plan = makePlan();

      const rollbackResult = await executor.rollbackRoutePlan(plan);

      expect(rollbackResult.ok).toBe(false);
      expect(rollbackResult.error).toContain('No snapshot');
    });

    it('rejects apply when multiple prior routes exist and rollback cannot be guaranteed', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', {
        stdout: JSON.stringify([
          { dst: 'default', gateway: '10.0.0.1', dev: 'eth0', metric: 100 },
          { dst: 'default', gateway: '10.0.0.2', dev: 'eth1', metric: 200 },
        ]),
      });
      runner.setResult('replace', 'default', { stdout: '', exitCode: 0 });

      const result = await executor.applyRoutePlan(plan);

      // Must reject before mutation when rollback cannot be guaranteed.
      expect(result.ok).toBe(false);
      expect(result.error).toContain('cannot guarantee exact rollback');

      // No mutation command should have been run.
      const replaceCall = runner.calls.find((c) => c.args.includes('replace'));
      expect(replaceCall).toBeUndefined();
    });

    it('rejects apply when pre-mutation route has unsupported attributes (multipath, onlink, mtu)', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', {
        stdout: JSON.stringify([
          {
            dst: 'default',
            gateway: '10.0.0.1',
            dev: 'eth0',
            metric: 100,
            multipath: [{ dev: 'eth0', gateway: '10.0.0.1' }],
          },
        ]),
      });
      runner.setResult('replace', 'default', { stdout: '', exitCode: 0 });

      const result = await executor.applyRoutePlan(plan);

      // Must reject because multipath routes cannot be replayed exactly.
      expect(result.ok).toBe(false);
      expect(result.error).toContain('cannot guarantee exact rollback');

      // No mutation should have been run.
      const replaceCall = runner.calls.find((c) => c.args.includes('replace'));
      expect(replaceCall).toBeUndefined();
    });
  });

  describe('verifyRoutePlan', () => {
    it('verifies route exists after apply', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', {
        stdout: JSON.stringify([{ dst: 'default', gateway: '10.0.0.1' }]),
      });

      const verified = await executor.verifyRoutePlan(plan);
      expect(verified).toBe(true);
    });

    it('returns false when route does not exist', async () => {
      const plan = makePlan();
      runner.setResult('show', 'default', { stdout: '[]' });

      const verified = await executor.verifyRoutePlan(plan);
      expect(verified).toBe(false);
    });
  });
});
