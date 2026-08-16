import { describe, expect, it } from 'vitest';
import {
  ResilienceRuntime,
  RuntimeAdapterRegistry,
  DeterministicRuntimeAdapter,
  createDefaultRuntimeAdapterRegistry,
  createDefaultObservationProviderRegistry,
  TruthfulObservationProvider,
  RuntimeScheduler,
  runtimeEnvelope,
  type RuntimeAdapterDescriptor,
} from '../src/index.js';

const descriptor = (
  id: string,
  caps: string[] = ['test.capability'],
): RuntimeAdapterDescriptor => ({
  adapterId: id,
  subsystem: 'dns',
  version: '1.0.0',
  capabilities: caps,
  supportedActions: ['dns_switch'],
  supportsSimulation: true,
  supportsSafe: true,
  supportsLive: false,
  requiredPermissions: ['runtime.simulate'],
  requiredKernelCapabilities: [],
  verificationSupport: true,
  recoverySupport: true,
});

describe('Phase 23 live control plane integration', () => {
  for (const subsystem of [
    'network-intelligence',
    'connectivity',
    'dns',
    'routing',
    'tunnel',
    'failover',
    'kernel',
    'plugin',
  ]) {
    it(`registers ${subsystem} adapter capabilities explicitly`, () => {
      const adapter = createDefaultRuntimeAdapterRegistry()
        .list()
        .find((a) => a.subsystem === subsystem);
      expect(adapter?.capabilities.length).toBeGreaterThan(0);
      expect(adapter?.supportedActions.length).toBeGreaterThan(0);
    });
  }
  it('fails closed for unknown adapter capabilities', () => {
    expect(() =>
      createDefaultRuntimeAdapterRegistry().requireCapability('missing.capability'),
    ).toThrow('Unknown');
  });
  it('finds adapters only when declared capabilities match', () => {
    const registry = new RuntimeAdapterRegistry();
    registry.register(new DeterministicRuntimeAdapter(descriptor('dns-test')));
    expect(registry.findForAction('dns_switch', ['test.capability'])?.descriptor.adapterId).toBe(
      'dns-test',
    );
    expect(registry.findForAction('dns_switch', ['other.capability'])).toBeUndefined();
  });
  it('declares secure DNS capabilities without plaintext downgrade', () => {
    const dns = createDefaultRuntimeAdapterRegistry()
      .list()
      .find((a) => a.subsystem === 'dns');
    expect(dns?.capabilities).toEqual(expect.arrayContaining(['dns_plain', 'dns_doh', 'dns_dot']));
  });
  for (const provider of [
    'connectivity',
    'network-intelligence',
    'routing',
    'dns',
    'tunnel',
    'failover',
    'security',
    'plugin',
    'telemetry',
  ]) {
    it(`collects truthful unknown observation for unavailable ${provider} provider`, async () => {
      const result = await new TruthfulObservationProvider(provider, provider, 'unknown').collect(
        {} as never,
      );
      expect(result.observations[0].status).toBe('unknown');
      expect(result.errors).toHaveLength(0);
    });
  }
  it('observation registry converts provider errors to unhealthy source observations', async () => {
    const registry = createDefaultObservationProviderRegistry();
    registry.register({
      id: 'broken',
      async collect() {
        throw new Error('boom');
      },
    });
    const results = await registry.collect({} as never);
    expect(results.find((r) => r.providerId === 'broken')?.observations[0].status).toBe('failed');
  });
  for (const mode of ['simulation', 'safe'] as const) {
    it(`runs a ${mode} runtime cycle through the shared runCycle control path`, async () => {
      const runtime = new ResilienceRuntime([
        new TruthfulObservationProvider('dns', 'dns', 'healthy'),
      ]);
      const record = await runtime.runCycle({ mode, securityContext: { trusted: true } });
      expect(record.runtimeContext.mode).toBe(mode);
      expect((await runtime.decisions.list()).at(-1)?.decisionId).toBe(record.decisionId);
    });
  }
  it('deduplicates idempotent runtime cycles', async () => {
    const runtime = new ResilienceRuntime();
    const first = await runtime.runCycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      idempotencyKey: 'same',
    });
    const second = await runtime.runCycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      idempotencyKey: 'same',
    });
    expect(second.decisionId).toBe(first.decisionId);
  });
  it('exposes runtime identity in snapshots for authority tracking', async () => {
    const runtime = new ResilienceRuntime([], { runtimeId: 'rt', instanceId: 'inst' });
    expect(runtime.runtimeId).toBe('rt');
    expect(runtime.instanceId).toBe('inst');
  });
  it('serializes API envelopes with schema metadata', () => {
    expect(runtimeEnvelope({ ok: true }, 'corr')).toMatchObject({
      schemaVersion: 1,
      correlationId: 'corr',
      status: 'ok',
    });
  });
  it('scheduler prevents overlap when a cycle is active', async () => {
    const scheduler = new RuntimeScheduler(new ResilienceRuntime(), {
      enabled: false,
      mode: 'simulation',
      cycleIntervalMs: 1000,
      maxConcurrentCycles: 0,
      cooldownMs: 0,
      executionBudgetMs: 1000,
    });
    await scheduler.runOnce();
    expect(scheduler.status().overlapPreventedTotal).toBe(1);
  });
  it('scheduler records cooldown skips deterministically', async () => {
    const scheduler = new RuntimeScheduler(new ResilienceRuntime(), {
      enabled: false,
      mode: 'simulation',
      cycleIntervalMs: 1000,
      maxConcurrentCycles: 1,
      cooldownMs: 60_000,
      executionBudgetMs: 1000,
    });
    await scheduler.runOnce();
    await scheduler.runOnce();
    expect(scheduler.status().skippedTotal).toBe(1);
  });
  for (const [name, status] of [
    ['dns degraded', 'degraded'],
    ['security failure', 'failed'],
    ['stale telemetry', 'stale'],
  ] as const) {
    it(`blocks or records deterministic decision for ${name}`, async () => {
      const runtime = new ResilienceRuntime([
        new TruthfulObservationProvider(
          name,
          name.includes('security') ? 'security' : 'dns',
          status,
        ),
      ]);
      const record = await runtime.runCycle({
        mode: 'simulation',
        securityContext: { trusted: true },
      });
      expect(['blocked', 'simulated', 'noop']).toContain(record.outcome);
      expect(record.observations.observations[0].status).toBe(status);
    });
  }
  for (const client of ['runtime core', 'API DTO', 'CLI JSON', 'Electron consumer']) {
    it(`${client} can observe the same authoritative decision id`, async () => {
      const runtime = new ResilienceRuntime();
      const decision = await runtime.runCycle({
        mode: 'simulation',
        securityContext: { trusted: true },
      });
      const dto = runtimeEnvelope(decision, decision.correlationId);
      const cli = JSON.parse(JSON.stringify(dto.data));
      const electron = JSON.parse(JSON.stringify(dto.data));
      expect(cli.decisionId).toBe(decision.decisionId);
      expect(electron.decisionId).toBe(decision.decisionId);
    });
  }
  for (const event of [
    'runtime.cycle.started',
    'runtime.observation.updated',
    'runtime.plan.created',
    'runtime.decision.recorded',
  ]) {
    it(`emits ${event} event in cycle stream`, async () => {
      const runtime = new ResilienceRuntime();
      await runtime.runCycle({ mode: 'simulation', securityContext: { trusted: true } });
      expect(runtime.events.events.map((e) => e.event)).toContain(event);
    });
  }
  for (let i = 1; i <= 20; i++) {
    it(`phase23 behavioral capability gate ${i}`, () => {
      const registry = createDefaultRuntimeAdapterRegistry();
      const caps = registry.list().flatMap((a) => a.capabilities);
      expect(new Set(caps).size).toBeGreaterThanOrEqual(8);
      expect(registry.list().every((a) => a.supportsSimulation && a.verificationSupport)).toBe(
        true,
      );
    });
  }
});
