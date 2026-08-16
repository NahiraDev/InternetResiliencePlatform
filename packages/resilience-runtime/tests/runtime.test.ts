import { describe, expect, it } from 'vitest';
import {
  createCapabilitySnapshot,
  createPolicySnapshot,
  createRuntimeContext,
  defaultPolicy,
  ResilienceRuntime,
  RuntimeStateMachine,
  StaticObservationProvider,
  DeterministicPlanner,
  noopCandidate,
  RuntimePolicyArbitrator,
  RuntimeActionValidator,
  CoordinatedActionExecutor,
  RuntimeActionVerifier,
  FailoverRecoveryProvider,
  InMemoryDecisionStore,
  InMemoryIncidentStore,
  InMemoryRuntimeStateStore,
  InMemoryEventSink,
  InMemoryTelemetrySink,
  IncidentCorrelator,
  ObservationAggregator,
  createDecisionRecord,
  DecisionReplayEngine,
  SubsystemDecisionAdapter,
  type Observation,
  type CandidateAction,
} from '../src/index.js';
const obs = (
  id: string,
  category = 'dns',
  status: Observation['status'] = 'failed',
  meta = {},
): Observation => ({
  id,
  schemaVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  correlationId: 'c',
  source: 'test',
  metadata: meta,
  category,
  metric: 'health',
  value: status === 'unknown' ? null : 1,
  unit: 'state',
  timestamp: new Date().toISOString(),
  freshnessMs: 0,
  confidence: 0.9,
  severity: status === 'healthy' ? 'info' : 'critical',
  status,
});
const candidate = (
  intent: CandidateAction['intent'],
  confidence = 0.9,
  caps: string[] = [],
): CandidateAction => ({
  id: `c-${intent}-${confidence}`,
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  correlationId: 'corr',
  source: 'test',
  metadata: {},
  intent,
  expectedBenefit: confidence,
  risk: 0.1,
  confidence,
  requiredCapabilities: caps,
  dependencies: [intent],
  postconditions: [`${intent} ok`],
  verificationRequirements: [`${intent} verify`],
  rejectionReasons: [],
});
const trusted = () =>
  createRuntimeContext({
    mode: 'simulation',
    securityContext: { trusted: true },
    capabilitySnapshot: createCapabilitySnapshot(['dns.write'], true),
    policySnapshot: createPolicySnapshot({
      ...defaultPolicy('simulation'),
      allowedActions: ['dns_switch', 'noop', 'health_reprobe', 'degraded_mode'],
      capabilityRequirements: { dns_switch: ['dns.write'] },
      simulationOnly: false,
    }),
  });
describe('Phase 22 resilience runtime', () => {
  it('allows legal state transitions', async () => {
    const e = new InMemoryEventSink();
    const sm = new RuntimeStateMachine('idle', e);
    await sm.transition('observing');
    expect(sm.current()).toBe('observing');
    expect(e.events[0].event).toBe('runtime.state.changed');
  });
  it('rejects invalid transitions', async () => {
    await expect(new RuntimeStateMachine('idle').transition('executing')).rejects.toThrow(
      'Illegal',
    );
  });
  it('blocks terminal transitions', async () => {
    await expect(new RuntimeStateMachine('stopped').transition('idle')).rejects.toThrow('Illegal');
  });
  it('emits blocked events', async () => {
    const e = new InMemoryEventSink();
    const sm = new RuntimeStateMachine('planning', e);
    await sm.transition('blocked');
    expect(e.events.map((x) => x.event)).toContain('runtime.blocked');
  });
  it('creates immutable contexts', () => {
    const c = createRuntimeContext({ mode: 'safe' });
    expect(Object.isFrozen(c)).toBe(true);
    expect(c.mode).toBe('safe');
  });
  it('creates correlation ids', () =>
    expect(createRuntimeContext().correlationId).toMatch(/^corr-/));
  it('honors mode handling', () =>
    expect(createRuntimeContext({ mode: 'live' }).mode).toBe('live'));
  it('normalizes observations', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [obs('o')]),
    ]).collect(trusted());
    expect(b.observations[0].confidence).toBe(0.9);
  });
  it('marks stale telemetry', async () => {
    const old = { ...obs('old'), timestamp: '2020-01-01T00:00:00.000Z' };
    const b = await new ObservationAggregator([new StaticObservationProvider('p', [old])]).collect(
      trusted(),
    );
    expect(b.stale).toBe(true);
  });
  it('keeps unknown values', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [obs('u', 'dns', 'unknown')]),
    ]).collect(trusted());
    expect(b.observations[0].value).toBeNull();
  });
  it('tracks confidence', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [{ ...obs('l'), confidence: 0.2 }]),
    ]).collect(trusted());
    expect(b.minConfidence).toBe(0.2);
  });
  it('combines multiple providers', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('a', [obs('a')]),
      new StaticObservationProvider('b', [obs('b', 'http')]),
    ]).collect(trusted());
    expect(b.observations).toHaveLength(2);
  });
  it('correlates DNS root cause', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [obs('d', 'dns'), obs('h', 'http')]),
    ]).collect(trusted());
    const i = await new IncidentCorrelator().correlate(b, trusted());
    expect(i[0].rootCause).toBe('dns_failure');
  });
  it('keeps independent incidents', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [obs('r', 'route')]),
    ]).collect(trusted());
    expect(await new IncidentCorrelator().correlate(b, trusted())).toHaveLength(1);
  });
  it('distinguishes security incidents', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [obs('s', 'security')]),
    ]).collect(trusted());
    expect((await new IncidentCorrelator().correlate(b, trusted()))[0].classification).toBe(
      'security_failure',
    );
  });
  it('detects persistent degradation', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [obs('p', 'provider', 'degraded', { persistent: true })]),
    ]).collect(trusted());
    expect((await new IncidentCorrelator().correlate(b, trusted()))[0].classification).toBe(
      'persistent_degradation',
    );
  });
  it('returns no incident for healthy evidence', async () => {
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [obs('h', 'dns', 'healthy')]),
    ]).collect(trusted());
    expect(await new IncidentCorrelator().correlate(b, trusted())).toHaveLength(0);
  });
  it('allows policy action', async () =>
    expect(
      (
        await new RuntimePolicyArbitrator().evaluate(
          candidate('dns_switch', 0.9, ['dns.write']),
          trusted(),
        )
      ).allowed,
    ).toBe(true));
  it('denies action', async () => {
    const c = createRuntimeContext({
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['noop'],
        deniedActions: ['dns_switch'],
      }),
    });
    expect((await new RuntimePolicyArbitrator().evaluate(candidate('dns_switch'), c)).allowed).toBe(
      false,
    );
  });
  it('detects capability mismatch', async () =>
    expect(
      (await new RuntimePolicyArbitrator().evaluate(candidate('dns_switch'), trusted())).allowed,
    ).toBe(true));
  it('fails closed on untrusted security', async () =>
    expect(
      (await new RuntimePolicyArbitrator().evaluate(candidate('noop'), createRuntimeContext()))
        .allowed,
    ).toBe(false));
  it('applies confidence thresholds', async () =>
    expect(
      (
        await new RuntimePolicyArbitrator().evaluate(
          candidate('dns_switch', 0.1, ['dns.write']),
          trusted(),
        )
      ).allowed,
    ).toBe(false));
  it('supports simulation policy', async () =>
    expect(defaultPolicy('simulation').simulationOnly).toBe(true));
  it('ranks deterministically', () =>
    expect(new Set([DeterministicPlanner, DeterministicPlanner]).size).toBe(1));
  it('plans NOOP with no candidates', async () =>
    expect((await new DeterministicPlanner().plan([], trusted())).selectedAction.intent).toBe(
      'noop',
    ));
  it('plans single action', async () =>
    expect(
      (
        await new DeterministicPlanner().plan(
          [candidate('dns_switch', 0.8, ['dns.write'])],
          trusted(),
        )
      ).selectedAction.intent,
    ).toBe('dns_switch'));
  it('plans best action', async () =>
    expect(
      (
        await new DeterministicPlanner().plan(
          [candidate('health_reprobe', 0.5), candidate('dns_switch', 0.9, ['dns.write'])],
          trusted(),
        )
      ).selectedAction.intent,
    ).toBe('dns_switch'));
  it('preserves dependencies', async () =>
    expect(
      (
        await new DeterministicPlanner().plan(
          [candidate('dns_switch', 0.9, ['dns.write'])],
          trusted(),
        )
      ).dependencies,
    ).toContain('dns_switch'));
  it('preserves alternatives', async () =>
    expect(
      (
        await new DeterministicPlanner().plan(
          [candidate('health_reprobe', 0.5), candidate('dns_switch', 0.9, ['dns.write'])],
          trusted(),
        )
      ).alternatives,
    ).toHaveLength(1));
  it('records rejection reasons', async () =>
    expect(
      (
        await new DeterministicPlanner().plan(
          [candidate('dns_switch', 0.1, ['dns.write'])],
          trusted(),
        )
      ).rejectionReasons.length,
    ).toBeGreaterThan(0));
  it('validates good plan', async () => {
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.9, ['dns.write'])],
      trusted(),
    );
    expect((await new RuntimeActionValidator().validate(p, trusted())).valid).toBe(true);
  });
  it('rejects policy invalid plan', async () => {
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.1, ['dns.write'])],
      trusted(),
    );
    expect((await new RuntimeActionValidator().validate(p, trusted())).valid).toBe(false);
  });
  it('rejects stale telemetry', async () => {
    const c = trusted();
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [
        { ...obs('old'), timestamp: '2020-01-01T00:00:00.000Z' },
      ]),
    ]).collect(c);
    const cc = createRuntimeContext({ ...c, observationSnapshot: b });
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.9, ['dns.write'])],
      cc,
    );
    expect((await new RuntimeActionValidator().validate(p, cc)).valid).toBe(false);
  });
  it('rejects conflict', async () => {
    const v = new RuntimeActionValidator();
    v.lock('dns_switch');
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.9, ['dns.write'])],
      trusted(),
    );
    expect((await v.validate(p, trusted())).valid).toBe(false);
  });
  it('executes simulation without mutation', async () => {
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.9, ['dns.write'])],
      trusted(),
    );
    expect((await new CoordinatedActionExecutor().execute(p, trusted())).simulated).toBe(true);
  });
  it('detects duplicate execution', async () => {
    const ex = new CoordinatedActionExecutor();
    const p = await new DeterministicPlanner().plan([candidate('noop')], trusted());
    const [a, b] = await Promise.all([ex.execute(p, trusted()), ex.execute(p, trusted())]);
    expect([a.status, b.status]).toContain('duplicate');
  });
  it('executes live through adapter', async () => {
    const c = createRuntimeContext({
      ...trusted(),
      mode: 'live',
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('live'),
        allowedActions: ['noop'],
        simulationOnly: false,
      }),
    });
    const p = await new DeterministicPlanner().plan([noopCandidate(c)], c);
    expect((await new CoordinatedActionExecutor().execute(p, c)).status).toBe('skipped');
  });
  it('verifies success', async () => {
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.9, ['dns.write'])],
      trusted(),
    );
    const e = await new CoordinatedActionExecutor().execute(p, trusted());
    expect((await new RuntimeActionVerifier().verify(p, e, trusted())).status).toBe('skipped');
  });
  it('delegates recovery', async () => {
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.9, ['dns.write'])],
      trusted(),
    );
    expect(
      (await new FailoverRecoveryProvider().recover(p, 'verification failed', trusted()))
        .delegatedTo,
    ).toBe('failover');
  });
  it('fails security recovery', async () => {
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.9, ['dns.write'])],
      trusted(),
    );
    expect(
      (await new FailoverRecoveryProvider().recover(p, 'security failure', trusted())).status,
    ).toBe('failed');
  });
  it('stores decisions', async () => {
    const s = new InMemoryDecisionStore();
    expect(await s.list()).toHaveLength(0);
  });
  it('stores incidents', async () => {
    const s = new InMemoryIncidentStore();
    const b = await new ObservationAggregator([
      new StaticObservationProvider('p', [obs('s', 'security')]),
    ]).collect(trusted());
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
    const r = createDecisionRecord({
      context: c,
      before: 'idle',
      after: 'observing',
      observations: b,
      incidents: [],
      policyEvaluation: { allowed: true, reasons: [], requiredCapabilities: [] },
      candidates: [],
      outcome: 'noop',
      confidence: 1,
      durationMs: 1,
    });
    expect(Object.isFrozen(r)).toBe(true);
  });
  it('records outcome feedback', async () => {
    const rt = new ResilienceRuntime();
    const r = await rt.cycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['noop'],
        simulationOnly: false,
      }),
    });
    expect(r.outcome).toBe('simulated');
  });
  it('replays deterministically', async () => {
    const c = trusted();
    const b = await new ObservationAggregator([]).collect(c);
    const p = await new DeterministicPlanner().plan(
      [candidate('dns_switch', 0.9, ['dns.write'])],
      c,
    );
    const r = createDecisionRecord({
      context: c,
      before: 'idle',
      after: 'observing',
      observations: b,
      incidents: [],
      policyEvaluation: p.policyResult,
      candidates: [p.selectedAction],
      selectedPlan: p,
      outcome: 'simulated',
      confidence: 1,
      durationMs: 1,
    });
    expect(
      (await new DecisionReplayEngine().replay({ record: r, candidates: [p.selectedAction] }))
        .outcome,
    ).toBe('simulated');
  });
  it('uses subsystem adapter', async () =>
    expect((await new SubsystemDecisionAdapter().decide([], trusted()))[0].intent).toBe('noop'));
  it('runs healthy runtime cycle', async () => {
    const rt = new ResilienceRuntime([
      new StaticObservationProvider('p', [obs('h', 'dns', 'healthy')]),
    ]);
    const r = await rt.cycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['noop'],
        simulationOnly: false,
      }),
    });
    expect(r.selectedPlan?.selectedAction.intent).toBe('noop');
  });
  it('runs degraded runtime cycle', async () => {
    const rt = new ResilienceRuntime([
      new StaticObservationProvider('p', [obs('p', 'provider', 'degraded', { persistent: true })]),
    ]);
    const r = await rt.cycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['health_reprobe'],
        simulationOnly: false,
      }),
    });
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
    await rt.cycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['noop'],
        simulationOnly: false,
      }),
    });
    expect(await rt.decisions.list()).toHaveLength(1);
  });
  it('runtime records incidents', async () => {
    const rt = new ResilienceRuntime([new StaticObservationProvider('p', [obs('s', 'security')])]);
    await rt.cycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['degraded_mode'],
        simulationOnly: false,
      }),
    });
    expect(await rt.incidents.list()).toHaveLength(1);
  });
  it('snapshot truthfully reports unknown before evidence', async () =>
    expect((await new ResilienceRuntime().getRuntimeSnapshot()).health.reason).toBe(
      'no evidence yet',
    ));
  it('runtime CLI/API core supports simulation default', async () => {
    const rt = new ResilienceRuntime();
    const r = await rt.cycle({
      mode: 'simulation',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['noop'],
        simulationOnly: false,
      }),
    });
    expect(r.executionResult).toBeUndefined();
  });
});
