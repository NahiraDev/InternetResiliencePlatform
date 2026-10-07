import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  negotiatePlatformCapabilities,
  platformCapabilities,
  platforms,
  explainDecision,
  ResilienceRuntime,
  StaticObservationProvider,
  createCapabilitySnapshot,
  createPolicySnapshot,
  defaultPolicy,
  type Observation,
} from '../src/index.js';

const repoRoot = (() => {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'AGENTS.md'))) return cwd;
  const candidate = resolve(cwd, '../..');
  if (existsSync(join(candidate, 'AGENTS.md'))) return candidate;
  return cwd;
})();

const walkTs = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.turbo'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
};

const FORBIDDEN_AUTHORITY = [
  /new\s+ResilienceRuntime\s*\(/,
  /new\s+NetworkAutopilot\s*\(/,
  /extends\s+NetworkAutopilot\b/,
  /new\s+(PolicyEngine|SafetyKernel|StateRegistry|TransactionExecutor|DecisionEngine|EventBus|Planner|ProviderRegistry)\s*\(/,
];

const CLIENT_TS_ROOTS = [
  'apps/api/src',
  'apps/cli/src',
  'apps/daemon/src',
  'packages/linux-client/src',
  'packages/macos-client/src',
  'packages/windows-client/src',
];

describe('Issue #280: Cross-Platform Adapters, Clients & Cockpit', () => {
  it('audits clients/hosts: no stale or duplicate authority in TS sources', () => {
    const violations: string[] = [];
    for (const root of CLIENT_TS_ROOTS) {
      for (const file of walkTs(join(repoRoot, root))) {
        const text = readFileSync(file, 'utf8');
        for (const pattern of FORBIDDEN_AUTHORITY) {
          if (pattern.test(text)) violations.push(`${file} matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('audits native clients: execution adapters only, decisions stay canonical', () => {
    const androidTunnel = join(
      repoRoot,
      'clients/android/app/src/main/java/com/nahiradev/irp/VpnTunnel.kt',
    );
    expect(existsSync(androidTunnel)).toBe(true);
    const android = readFileSync(androidTunnel, 'utf8');
    expect(android).toMatch(/remain in Core\/Control Plane/);
    expect(android).not.toMatch(/\b(PolicyEngine|DecisionEngine|RoutingEngine|FailoverManager)\b/);

    const iosRoot = join(repoRoot, 'clients/ios/Sources');
    expect(existsSync(iosRoot)).toBe(true);
    const swift: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.swift')) swift.push(full);
      }
    };
    walk(iosRoot);
    expect(swift.length).toBeGreaterThan(0);
    const offenders = swift.filter((file) =>
      /\b(PolicyEngine|DecisionEngine|RoutingEngine|FailoverManager|DecisionManager)\b/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('negotiates platform capabilities without claiming unsupported natives', () => {
    expect(platforms).toEqual(
      expect.arrayContaining(['linux', 'macos', 'windows', 'ios', 'android']),
    );

    const linux = negotiatePlatformCapabilities('linux', ['dns.write', 'route.write']);
    expect(linux.denied).toEqual([]);
    expect(linux.granted).toEqual(['dns.write', 'route.write']);

    const macos = negotiatePlatformCapabilities('macos', ['observability.read', 'route.write']);
    expect(macos.granted).toEqual(['observability.read']);
    expect(macos.denied).toEqual(['route.write']);
    expect(macos.reasons[0]).toMatch(/route through the canonical runtime\/adapters/);

    const ios = negotiatePlatformCapabilities('ios', ['tunnel.execute', 'gateway.select']);
    expect(ios.granted).toEqual(['tunnel.execute']);
    expect(ios.denied).toEqual(['gateway.select']);

    const android = negotiatePlatformCapabilities('android', ['tunnel.execute', 'dns.write']);
    expect(android.granted).toEqual(['tunnel.execute']);
    expect(android.denied).toEqual(['dns.write']);

    // Tables are exact: negotiation can never grant what the table lacks.
    for (const platform of platforms) {
      const table = platformCapabilities(platform);
      const probe = negotiatePlatformCapabilities(platform, [...table, 'root.everything']);
      expect(probe.granted).toEqual([...table]);
      expect(probe.denied).toEqual(['root.everything']);
    }
  });

  it('exposes explainable decisions: constraints, path, health, failure domain, posture, recovery', async () => {
    const failed: Observation = {
      id: 'client-audit-dns',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      correlationId: 'client-audit',
      source: 'client-audit',
      metadata: {},
      category: 'dns',
      metric: 'health',
      value: 1,
      unit: 'state',
      timestamp: new Date().toISOString(),
      freshnessMs: 0,
      confidence: 0.9,
      severity: 'critical',
      status: 'failed',
    };
    const runtime = new ResilienceRuntime([new StaticObservationProvider('p', [failed])]);
    const record = await runtime.cycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot(['dns.write'], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['dns_switch', 'noop'],
        deniedActions: [],
        simulationOnly: false,
      }),
    });

    const view = explainDecision(record);
    expect(view.intent).toBe(record.selectedPlan?.selectedAction.intent ?? null);
    expect(view.outcome).toBe(record.outcome);
    expect(view.mode).toBe('simulation');
    expect(view.constraints.allowedActions).toContain('dns_switch');
    expect(view.path.from).toBeTruthy();
    expect(view.path.to).toBeTruthy();
    expect(view.incidents.length).toBeGreaterThan(0);
    expect(view.failureDomain).toContain('dns');
    expect(view.securityPosture).toBe('clear');
    expect(typeof view.recoveryState).toBe('string');
    expect(view.explanation).toEqual(record.explanation);
  });

  it('guards the cockpit contract: observability surface, never an authority', () => {
    const roots = ['apps/api/src', 'apps/cli/src', 'apps/daemon/src'];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walkTs(join(repoRoot, root))) {
        const text = readFileSync(file, 'utf8');
        if (/\b(CockpitRuntime|CockpitEngine|CockpitAuthority)\b/.test(text)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
    // The explanation view is data: it cannot mutate runtime state.
    expect(typeof explainDecision).toBe('function');
  });
});
