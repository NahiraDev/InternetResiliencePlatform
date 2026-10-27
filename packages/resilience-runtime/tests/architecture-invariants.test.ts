import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = (() => {
  const cwd = process.cwd();
  // when vitest runs inside package, cwd is packages/resilience-runtime
  if (existsSync(join(cwd, 'AGENTS.md'))) return cwd;
  const candidate = resolve(cwd, '../..');
  if (existsSync(join(candidate, 'AGENTS.md'))) return candidate;
  return cwd;
})();
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

describe('Architecture invariants (section 109)', () => {
  it('only canonical runtime mutates privileged network state', () => {
    const runtime = read('packages/resilience-runtime/src/runtime.ts');
    expect(runtime).toContain('SafetyRollbackRecoveryKernel');
    expect(runtime).toContain('ActionTransactionEngine');
    expect(runtime).toContain('CoordinatedActionExecutor');
  });

  it('has no legacy live execution fallback outside the privileged boundary', () => {
    // The safety kernel is retained only as the boundary's internal safety port.
    // It must expose no execution method, and the cycle must never call one.
    const kernel = read('packages/resilience-runtime/src/safety/safety-kernel.ts');
    expect(kernel).not.toMatch(/^\s{2}(async\s+)?execute\s*\(/m);
    expect(kernel).not.toContain('ActionTransactionEngine');
    const runtime = read('packages/resilience-runtime/src/runtime.ts');
    expect(runtime).not.toContain('safetyKernel.execute');
    // The boundary is unconditional for every non-simulation mutation: there is
    // no knowledge-store- or capability-dependent alternate executor branch.
    expect(runtime).not.toMatch(/mutationBoundary\s*!==\s*undefined/);
    expect(runtime).not.toMatch(/else\s+if\s*\([^)]*knowledgeStore[^)]*\)\s*\{\s*\/\/\s*Use privileged/);
  });

  it('emits only taxonomy-conformant events with required identity', async () => {
    const { EVENT_TAXONOMY } = await import('../src/events/event-taxonomy.js');
    const runtime = read('packages/resilience-runtime/src/runtime.ts');
    const stateMachine = read('packages/resilience-runtime/src/state/state-machine.ts');
    const safety = read('packages/resilience-runtime/src/safety/safety-kernel.ts');
    const boundary = read('packages/resilience-runtime/src/transactions/privileged-boundary.ts');
    const sources = { runtime, stateMachine, safety, boundary };

    const emitted = new Set<string>();
    for (const source of Object.values(sources)) {
      for (const match of source.matchAll(/emit\(\s*'([a-z][a-zA-Z0-9._-]*)'/g)) {
        emitted.add(match[1]);
      }
    }
    expect(emitted.size).toBeGreaterThan(0);
    const unknown = [...emitted].filter((name) => !EVENT_TAXONOMY.some((d) => d.type === name));
    expect(unknown).toEqual([]);
  });

  it('API cannot bypass safety (LIVE_MODE_DISABLED)', () => {
    const api = read('apps/api/src/index.ts');
    expect(api).toContain('LIVE_MODE_DISABLED');
    expect(api).not.toMatch(/new\s+NetworkAutopilot/);
  });

  it('CLI cannot bypass safety', () => {
    const cli = read('apps/cli/src/index.ts');
    expect(cli).toContain('cannot be bypassed by CLI');
  });

  it('daemon and Linux client use the same canonical composition boundary', () => {
    const daemon = read('apps/daemon/src/index.ts');
    const linux = read('packages/linux-client/src/index.ts');
    for (const host of [daemon, linux]) {
      expect(host).toContain('createCanonicalRuntime');
      expect(host).not.toMatch(/new\s+ResilienceRuntime/);
    }
    const composition = read('packages/resilience-runtime/src/canonical-runtime-composition.ts');
    expect(composition).toContain('new ResilienceRuntime');
    expect(read('packages/resilience-runtime/src/runtime.ts')).toContain(
      'SafetyRollbackRecoveryKernel',
    );
  });

  it('daemon handles shutdown and injects canonical control plane', () => {
    const daemon = read('apps/daemon/src/index.ts');
    expect(daemon).toContain('SIGTERM');
    expect(daemon).toContain('networkControlPlane');
    expect(daemon).toContain('createCanonicalRuntime');
  });

  it('legacy NetworkAutopilot remains deprecated and not instantiated in prod', () => {
    const autopilot = read('packages/resilience-runtime/src/autopilot/autopilot.ts');
    expect(autopilot).toContain('@deprecated');
    for (const f of [
      'apps/api/src/index.ts',
      'apps/daemon/src/index.ts',
      'apps/cli/src/index.ts',
    ]) {
      expect(read(f)).not.toMatch(/new\s+NetworkAutopilot/);
    }
  });

  it('AI cannot directly execute privileged operations (bridge is advisory)', () => {
    const provider = read('packages/resilience-runtime/src/canonical-decision-provider.ts');
    expect(provider).toContain('InternetIntelligenceBridge');
    // Bridge analyze must be called before engine, not after execution
    expect(provider).not.toMatch(/execFile|resolvectl|iptables/);
  });

  it('bounded closed-loop is safe-by-default', () => {
    const closed = read('packages/resilience-runtime/src/closed-loop.ts');
    expect(closed).toContain('DEFAULT_MAX_CYCLES = 1');
    expect(closed).toContain('MAX_ALLOWED_CYCLES = 10');
    expect(closed).toContain('signal?.aborted');
  });

  it('plugins cannot bypass capability checks (host boundary)', () => {
    const host = read('apps/daemon/src/plugin-host.ts');
    expect(host).toContain('PluginHost');
    const runtime = read('packages/resilience-runtime/src/runtime.ts');
    expect(runtime).toContain('capabilitySnapshot');
  });

  it('critical decisions are observable (events/telemetry)', () => {
    const runtime = read('packages/resilience-runtime/src/runtime.ts');
    expect(runtime).toContain('runtime.cycle.started');
    expect(runtime).toContain('runtime.plan.created');
    expect(read('packages/resilience-runtime/src/events/events.ts')).toContain('EventSink');
  });

  it('architecture maps exist with schemaVersion 1', () => {
    for (const p of [
      'docs/architecture/system-integration-map.json',
      'docs/architecture/runtime-execution-graph.json',
      'docs/architecture/failure-recovery-graph.json',
      'docs/architecture/security-boundary-graph.json',
    ]) {
      expect(existsSync(join(repoRoot, p))).toBe(true);
      const j = JSON.parse(read(p));
      expect(j.schemaVersion).toBe(1);
    }
  });

  it('AGENTS.md is quick start not mission prompt', () => {
    const ag = read('AGENTS.md');
    expect(ag).toContain('Agent Quick Start');
    expect(ag.length).toBeLessThan(5000);
  });

  it('federation remains advisory (fail-open, not critical)', () => {
    const runtime = read('packages/resilience-runtime/src/runtime.ts');
    // Runtime does not require federation to start cycle
    expect(runtime).not.toContain('federationRequired');
    const provider = read('packages/resilience-runtime/src/canonical-decision-provider.ts');
    expect(provider).toContain('federatedEvidence');
  });
});
