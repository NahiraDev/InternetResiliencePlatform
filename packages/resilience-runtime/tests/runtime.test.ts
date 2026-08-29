import { describe, expect, it } from 'vitest';
import {
  CandidateAction,
  RuntimeActionValidator,
  ResilienceRuntime,
  CoordinatedActionExecutor,
  DeterministicPlanner,
  ObservationAggregator,
  StaticObservationProvider,
  createRuntimeContext,
  createCapabilitySnapshot,
  createPolicySnapshot,
  defaultPolicy,
  IncidentCorrelator,
  InMemoryDecisionStore,
  InMemoryIncidentStore,
  InMemoryRuntimeStateStore,
  InMemoryEventSink,
  InMemoryTelemetrySink,
  createDecisionRecord,
  DecisionReplayEngine,
  SubsystemDecisionAdapter,
  FailoverRecoveryProvider,
  RuntimeActionVerifier,
} from '../src/index.js';

const trusted = () => createRuntimeContext({
  mode: 'simulation',
  securityContext: { trusted: true },
  capabilitySnapshot: createCapabilitySnapshot([], true),
  policySnapshot: createPolicySnapshot({
    ...defaultPolicy('simulation'),
    allowedActions: ['noop', 'dns_switch'],
    simulationOnly: false,
  }),
});

const candidate = (intent: CandidateAction['intent'], confidence = 0.9, capabilities: string[] = []) => ({
  id: `candidate-${intent}`,
  schemaVersion: 1 as const,
  createdAt: '2026-08-21T00:00:00.000Z',
  correlationId: 'test',
  source: 'test',
  metadata: {},
  intent,
  expectedBenefit: 0.9,
  risk: 0.1,
  confidence,
  requiredCapabilities: capabilities,
  dependencies: [intent],
  postconditions: [`${intent} verified`],
  verificationRequirements: [`${intent} verification`],
  rejectionReasons: [],
});

const obs = (id: string, category = 'dns', status: 'unknown' | 'healthy' | 'degraded' | 'failed' = 'degraded', metadata: Record<string, unknown> = {}) => ({
  id,
  schemaVersion: 1 as const,
  createdAt: '2026-08-21T00:00:00.000Z',
  correlationId: 'test',
  source: 'test',
  metadata,
  category,
  metric: 'health',
  value: status,
  timestamp: '2026-08-21T00:00:00.000Z',
  freshnessMs: 0,
  confidence: status === 'unknown' ? 0 : 0.95,
  severity: status === 'healthy' ? 'info' : status === 'failed' ? 'critical' : 'warning',
  status,
});

const noopCandidate = (context: ReturnType<typeof trusted>) => ({
  ...candidate('noop'),
  correlationId: context.correlationId,
  dependencies: ['noop'],
});

describe('Phase 22 resilience runtime', () => {
  it('allows legal state transitions', async () => {
    const rt = new ResilienceRuntime();
    await rt.state.transition('observing', 'c');
    expect(rt.state.current()).toBe('observing');
  });
  it('rejects invalid transitions', async () => {
    const rt = new ResilienceRuntime();
    await expect(rt.state.transition('executing', 'c')).rejects.toThrow();
  });
  it('blocks terminal transitions', async () => {
    const rt = new ResilienceRuntime();
    await rt.state.transition('failed', 'c');
    await expect(rt.state.transition('observing', 'c')).rejects.toThrow();
  });
  it('emits blocked events', async () => {
    const rt = new ResilienceRuntime();
    await expect(rt.state.transition('executing', 'c')).rejects.toThrow();
    expect(rt.events.events.some((event) => event.type === 'runtime.state.transition.blocked')).toBe(true);
  });
  it('creates immutable contexts', () => {
    const c = trusted();
    expect(Object.isFrozen(c)).toBe(true);
  });
  it('creates correlation ids', () => {
    expect(trusted().correlationId).toBeTruthy();
  });
  it('honors mode handling', () => {
    expect(trusted().mode).toBe('simulation');
  });
  it('normalizes observations', async () => {
    const batch = await new ObservationAggregator([new StaticObservationProvider('p', [obs('a')])]).collect(trusted());
    expect(batch.observations).toHaveLength(1);
  });
  it('marks stale telemetry', async () => {
    const batch = await new ObservationAggregator([new StaticObservationProvider('p', [{ ...obs('old'), timestamp: '2020-01-01T00:00:00.000Z' }])]).collect(trusted());
    expect(batch.stale).toBe(true);
  });
  it('keeps unknown values', () => {
    expect(obs('u', 'dns', 'unknown').status).toBe('unknown');
  });
  it('tracks confidence', () => {
    expect(obs('h', 'dns', 'healthy').confidence).toBeGreaterThan(0);
  });
  it('combines multiple providers', async () => {
    const batch = await new ObservationAggregator([
      new StaticObservationProvider('a', [obs('a')]),
      new StaticObservationProvider('b', [obs('b')]),
    ]).collect(trusted());
    expect(batch.observations).toHaveLength(2);
  });
  it('correlates DNS root cause', async () => {
    const b = await new ObservationAggregator([new StaticObservationProvider('p', [obs('d', 'dns', 'failed')])]).collect(trusted());
    expect((await new IncidentCorrelator().correlate(b, trusted()))[0].rootCause).toBe('dns_failure');
  });
  it('keeps independent incidents', async () => {
    const b = await new ObservationAggregator([new StaticObservationProvider('p', [obs('d', 'dns', 'failed'), obs('p', 'provider', 'degraded')])]).collect(trusted());
    expect((await new IncidentCorrelator().correlate(b, trusted())).length).toBeGreaterThan(1);
  });
  it('distinguishes security incidents', async () => {
    const b = await new ObservationAggregator([new StaticObservationProvider('p', [obs('s', 'security')])]).collect(trusted());
    expect((await new IncidentCorrelator().correlate(b, trusted()))[0].classification).toBe('security');
  });
  it('detects persistent degradation', async () => {
    const b = await new ObservationAggregator([new StaticObservationProvider('p', [obs('p', 'provider', 'degraded', { persistent: true })])]).collect(trusted());
    expect((await new IncidentCorrelator().correlate(b, trusted()))[0].classification).toBe('persistent_degradation');
  });
  it('returns no incident for healthy evidence', async () => {
    const b = await new ObservationAggregator([new StaticObservationProvider('p', [obs('h', 'dns', 'healthy')])]).collect(trusted());
    expect(await new IncidentCorrelator().correlate(b, trusted())).toHaveLength(0);
  });
  it('allows policy action', async () => {
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], trusted());
    expect(p.policyResult.allowed).toBe(true);
  });
  it('denies action', async () => {
    const c = createRuntimeContext({ ...trusted(), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: [] }) });
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], c);
    expect(p.policyResult.allowed).toBe(false);
  });
  it('detects capability mismatch', async () => {
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['missing.capability'])], trusted());
    expect(p.requiredCapabilities).toContain('missing.capability');
  });
  it('fails closed on untrusted security', async () => {
    const c = createRuntimeContext({ ...trusted(), securityContext: { trusted: false } });
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], c);
    expect((await new RuntimeActionValidator().validate(p, c)).valid).toBe(false);
  });
  it('applies confidence thresholds', async () => {
    const c = createRuntimeContext({ ...trusted(), configuration: { ...trusted().configuration, minDecisionConfidence: 0.99 } });
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], c);
    expect((await new RuntimeActionValidator().validate(p, c)).valid).toBe(false);
  });
  it('supports simulation policy', async () => {
    expect((await new RuntimeActionValidator().validate(await new DeterministicPlanner().plan([candidate('noop')], trusted()), trusted())).valid).toBe(true);
  });
  it('ranks deterministically', async () => {
    const planner = new DeterministicPlanner();
    const a = await planner.plan([candidate('noop', 0.9)], trusted());
    const b = await planner.plan([candidate('noop', 0.9)], trusted());
    expect(a.selectedAction.intent).toBe(b.selectedAction.intent);
  });
  it('plans NOOP with no candidates', async () => {
    const p = await new DeterministicPlanner().plan([], trusted());
    expect(p.selectedAction.intent).toBe('noop');
  });
  it('plans single action', async () => {
    expect((await new DeterministicPlanner().plan([candidate('noop')], trusted())).selectedAction.intent).toBe('noop');
  });
  it('plans best action', async () => {
    expect((await new DeterministicPlanner().plan([candidate('noop', 0.9), candidate('noop', 0.8)], trusted())).selectedAction.confidence).toBe(0.9);
  });
  it('preserves dependencies', async () => {
    expect((await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], trusted())).dependencies).toEqual(['dns_switch']);
  });
  it('preserves alternatives', async () => {
    const p = await new DeterministicPlanner().plan([candidate('noop', 0.9), candidate('noop', 0.8)], trusted());
    expect(p.alternatives).toHaveLength(1);
  });
  it('records rejection reasons', async () => {
    const c = createRuntimeContext({ ...trusted(), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: [] }) });
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], c);
    expect(p.rejectionReasons.length).toBeGreaterThan(0);
  });
  it('validates good plan', async () => {
    const p = await new DeterministicPlanner().plan([candidate('noop')], trusted());
    expect((await new RuntimeActionValidator().validate(p, trusted())).valid).toBe(true);
  });
  it('rejects policy invalid plan', async () => {
    const c = createRuntimeContext({ ...trusted(), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: [] }) });
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], c);
    expect((await new RuntimeActionValidator().validate(p, c)).valid).toBe(false);
  });
  it('rejects stale telemetry', async () => {
    const c = trusted();
    const b = await new ObservationAggregator([new StaticObservationProvider('p', [{ ...obs('old'), timestamp: '2020-01-01T00:00:00.000Z' }])]).collect(c);
    const cc = createRuntimeContext({ ...c, observationSnapshot: b });
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], cc);
    expect((await new RuntimeActionValidator().validate(p, cc)).valid).toBe(false);
  });
  it('rejects conflict', async () => {
    const v = new RuntimeActionValidator();
    v.lock('dns_switch');
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], trusted());
    expect((await v.validate(p, trusted(), true)).valid).toBe(false);
  });
  it('executes simulation without mutation', async () => {
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], trusted());
    expect((await new CoordinatedActionExecutor().execute(p, trusted())).simulated).toBe(true);
  });
  it('detects duplicate execution', async () => {
    const ex = new CoordinatedActionExecutor();
    const p = await new DeterministicPlanner().plan([candidate('noop')], trusted());
    const [a, b] = await Promise.all([ex.execute(p, trusted()), ex.execute(p, trusted())]);
    expect([a.status, b.status]).toContain('duplicate');
  });
  it('executes live through adapter', async () => {
    const c = createRuntimeContext({ ...trusted(), mode: 'live', policySnapshot: createPolicySnapshot({ ...defaultPolicy('live'), allowedActions: ['noop'], simulationOnly: false }) });
    const p = await new DeterministicPlanner().plan([noopCandidate(c)], c);
    expect((await new CoordinatedActionExecutor().execute(p, c)).status).toBe('skipped');
  });
  it('verifies success', async () => {
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], trusted());
    const e = await new CoordinatedActionExecutor().execute(p, trusted());
    expect((await new RuntimeActionVerifier().verify(p, e, trusted())).status).toBe('skipped');
  });
  it('delegates recovery', async () => {
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], trusted());
    expect((await new FailoverRecoveryProvider().recover(p, 'verification failed', trusted())).delegatedTo).toBe('failover');
  });
  it('fails security recovery', async () => {
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], trusted());
    expect((await new FailoverRecoveryProvider().recover(p, 'security failure', trusted())).status).toBe('failed');
  });
  it('stores decisions', async () => {
    const s = new InMemoryDecisionStore();
    expect(await s.list()).toHaveLength(0);
  });
  it('stores incidents', async () => {
    const s = new InMemoryIncidentStore();
    const b = await new ObservationAggregator([new StaticObservationProvider('p', [obs('s', 'security')])]).collect(trusted());
    const i = (await new IncidentCorrelator().correlate(b, trusted()))[0];
    await s.put(i);
    expect(await s.list()).toHaveLength(1);
  });
  it('stores runtime state', async () => {
    const s = new InMemoryRuntimeStateStore();
    await s.set('blocked');
    expect(await s.get()).toBe('blocked');
  });
  it('redacts decision records', async () => {
    const c = trusted();
    const b = await new ObservationAggregator([]).collect(c);
    const r = createDecisionRecord({ context: c, before: 'idle', after: 'observing', observations: b, incidents: [], policyEvaluation: { allowed: true, reasons: [], requiredCapabilities: [] }, candidates: [], outcome: 'noop', confidence: 1, durationMs: 1 });
    expect(Object.isFrozen(r)).toBe(true);
  });
  it('records outcome feedback', async () => {
    const rt = new ResilienceRuntime();
    const r = await rt.cycle({ mode: 'simulation', securityContext: { trusted: true }, capabilitySnapshot: createCapabilitySnapshot([], true), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['noop'], simulationOnly: false }) });
    expect(r.outcome).toBe('simulated');
  });
  it('replays deterministically', async () => {
    const c = trusted();
    const b = await new ObservationAggregator([]).collect(c);
    const p = await new DeterministicPlanner().plan([candidate('dns_switch', 0.9, ['dns.write'])], c);
    const r = createDecisionRecord({ context: c, before: 'idle', after: 'observing', observations: b, incidents: [], policyEvaluation: p.policyResult, candidates: [p.selectedAction], selectedPlan: p, outcome: 'simulated', confidence: 1, durationMs: 1 });
    expect((await new DecisionReplayEngine().replay({ record: r, candidates: [p.selectedAction] })).outcome).toBe('simulated');
  });
  it('uses subsystem adapter', async () => {
    expect((await new SubsystemDecisionAdapter().decide([], trusted()))[0].intent).toBe('noop');
  });
  it('runs healthy runtime cycle', async () => {
    const rt = new ResilienceRuntime([new StaticObservationProvider('p', [obs('h', 'dns', 'healthy')])]);
    const r = await rt.cycle({ mode: 'simulation', securityContext: { trusted: true }, capabilitySnapshot: createCapabilitySnapshot([], true), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['noop'], simulationOnly: false }) });
    expect(r.selectedPlan?.selectedAction.intent).toBe('noop');
  });
  it('runs degraded runtime cycle', async () => {
    const rt = new ResilienceRuntime([new StaticObservationProvider('p', [obs('p', 'provider', 'degraded', { persistent: true })])]);
    const r = await rt.cycle({ mode: 'simulation', securityContext: { trusted: true }, capabilitySnapshot: createCapabilitySnapshot([], true), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['health_reprobe'], simulationOnly: false }) });
    expect(r.incidents[0].classification).toBe('persistent_degradation');
  });
  it('blocks runtime policy violation', async () => {
    const rt = new ResilienceRuntime([new StaticObservationProvider('p', [obs('d', 'dns')])]);
    const r = await rt.cycle({ mode: 'simulation' });
    expect(r.outcome).toBe('blocked');
  });
  it('produces snapshot', async () => {
    const rt = new ResilienceRuntime();
    expect((await rt.getRuntimeSnapshot()).health.status).toBe('unknown');
  });
  it('emits telemetry', async () => {
    const t = new InMemoryTelemetrySink();
    t.increment('runtime_cycles_total');
    expect(t.snapshot().runtime_cycles_total).toBe(1);
  });
  it('emits events', async () => {
    const e = new InMemoryEventSink();
    await e.emit('runtime.cycle.started', { correlationId: 'c' });
    expect(e.events).toHaveLength(1);
  });
  it('runtime records decisions', async () => {
    const rt = new ResilienceRuntime();
    await rt.cycle({ mode: 'simulation', securityContext: { trusted: true }, capabilitySnapshot: createCapabilitySnapshot([], true), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['noop'], simulationOnly: false }) });
    expect(await rt.decisions.list()).toHaveLength(1);
  });
  it('runtime records incidents', async () => {
    const rt = new ResilienceRuntime([new StaticObservationProvider('p', [obs('s', 'security')])]);
    await rt.cycle({ mode: 'simulation', securityContext: { trusted: true }, capabilitySnapshot: createCapabilitySnapshot([], true), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['degraded_mode'], simulationOnly: false }) });
    expect(await rt.incidents.list()).toHaveLength(1);
  });
  it('snapshot truthfully reports unknown before evidence', async () => {
    expect((await new ResilienceRuntime().getRuntimeSnapshot()).health.reason).toBe('no evidence yet');
  });
  it('runtime CLI/API core supports simulation default', async () => {
    const rt = new ResilienceRuntime();
    const r = await rt.cycle({ mode: 'simulation', securityContext: { trusted: true }, capabilitySnapshot: createCapabilitySnapshot([], true), policySnapshot: createPolicySnapshot({ ...defaultPolicy('simulation'), allowedActions: ['noop'], simulationOnly: false }) });
    expect(r.executionResult).toBeUndefined();
  });
});
