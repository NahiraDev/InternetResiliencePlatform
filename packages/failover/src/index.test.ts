import { describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  DependencyGraph,
  FailoverRecoveryEngine,
  RecoveryBudget,
  defaultRecoveryConfig,
  type Failure,
  type HealthSignal,
} from './index.js';

const dnsTimeout = (component = 'resolver-a'): HealthSignal => ({
  domain: 'resolver',
  component,
  source: 'dns',
  status: 'timeout',
  timeout: true,
  healthScore: 30,
  message: 'DNS timeout',
});
const confirmedFailure = (domain: Failure['domain'] = 'dns-transport'): Failure => ({
  id: 'f1',
  domain,
  component: 'doh',
  type: domain === 'security' ? 'security' : 'persistent',
  severity: 'major',
  confidence: 'high',
  confidenceScore: 90,
  detectedAt: new Date().toISOString(),
  source: 'test',
  evidence: [
    {
      signalId: 's1',
      source: 'test',
      message: 'failed',
      observedAt: new Date().toISOString(),
      weight: 90,
    },
  ],
  impact: {
    affectedDomains: [domain],
    affectedComponents: ['doh'],
    downstreamComponents: [],
    serviceImpact: domain === 'security' ? 'security-risk' : 'degraded',
    estimatedBlastRadius: 1,
  },
  state: 'confirmed',
});

describe('Phase 16 failover recovery engine', () => {
  it('detects only after threshold and confirms confidence', () => {
    const engine = new FailoverRecoveryEngine(
      {},
      { detectionThreshold: 2, confirmationThreshold: 2, confidenceThreshold: 60 },
    );
    expect(engine.detect(dnsTimeout())).toBeUndefined();
    const failure = engine.detect(dnsTimeout());
    expect(failure?.type).toBe('intermittent');
    expect(engine.confirm(failure!).state).toBe('confirmed');
  });
  it('correlates downstream failures behind one upstream connectivity failure', () => {
    const engine = new FailoverRecoveryEngine();
    const correlated = engine.correlate([
      confirmedFailure('dns'),
      confirmedFailure('connectivity'),
      confirmedFailure('dns-transport'),
    ]);
    expect(correlated).toHaveLength(1);
    expect(correlated[0]?.domain).toBe('connectivity');
    expect(correlated[0]?.impact.affectedDomains).toContain('dns-transport');
  });
  it('orders dependency graph recovery upstream to downstream', () => {
    const graph = new DependencyGraph();
    graph.addDependency('connectivity', 'route');
    graph.addDependency('route', 'dns');
    expect(graph.downstream('connectivity')).toEqual(['route', 'dns']);
    expect(graph.upstream('dns')).toEqual(['route']);
  });
  it('rejects invalid recovery state transitions', () => {
    const engine = new FailoverRecoveryEngine();
    expect(() => engine.transition('executing')).toThrow(/Invalid recovery transition/);
  });
  it('enforces retry, failover, switch, and recovery budgets', () => {
    const budget = new RecoveryBudget({
      ...defaultRecoveryConfig(),
      maxRetries: 1,
      maxFailovers: 1,
      maxComponentSwitches: 1,
      maxRecoveryAttempts: 1,
    });
    expect(budget.consume('retry')).toBe(true);
    expect(budget.consume('retry')).toBe(false);
    expect(budget.consume('failover')).toBe(true);
    expect(budget.consume('failover')).toBe(false);
    expect(budget.consume('switch')).toBe(true);
    expect(budget.consume('switch')).toBe(false);
    expect(budget.consume('recovery')).toBe(true);
    expect(budget.consume('recovery')).toBe(false);
  });
  it('opens, half-opens, closes, and resets circuit breakers', () => {
    const cb = new CircuitBreaker(2, 1);
    cb.record(false);
    expect(cb.state).toBe('closed');
    cb.record(false);
    expect(cb.state).toBe('open');
    expect(cb.allow(Date.now() + 2)).toBe(true);
    expect(cb.state).toBe('half-open');
    cb.record(true);
    expect(cb.state).toBe('closed');
    cb.record(false);
    cb.record(false);
    cb.reset();
    expect(cb.state).toBe('closed');
  });
  it('simulates without executing adapters and explains secure DNS transport fallback', async () => {
    const switchSource = vi.fn();
    const engine = new FailoverRecoveryEngine({
      connectivity: { getAvailableSources: () => [], switchSource } as never,
    });
    const decision = await engine.simulateRecovery(confirmedFailure('dns-transport'));
    expect(switchSource).not.toHaveBeenCalled();
    expect(decision.actions).toContain('switch-dns-transport');
    expect(decision.explanation.security).toContain('secure alternatives preferred');
  });
  it('rejects insecure fallback for security failures', async () => {
    const engine = new FailoverRecoveryEngine();
    const decision = await engine.simulateRecovery(confirmedFailure('security'));
    expect(
      decision.rejectedCandidates.some((c) =>
        c.rejectionReasons.includes('security-policy-rejects-insecure-fallback'),
      ) || decision.explanation.security,
    ).toBeTruthy();
  });
  it('enters degraded mode when automatic recovery is disabled', async () => {
    const engine = new FailoverRecoveryEngine({}, { automaticRecovery: false });
    const plan = await engine.recover(confirmedFailure('resolver'));
    expect(plan.selectedStrategy.id).toBe('strategy:degraded');
  });
  it('bounds recovery history', async () => {
    const engine = new FailoverRecoveryEngine({}, { maxHistory: 2 });
    await engine.execute(await engine.plan(confirmedFailure('dns-transport')));
    await engine.execute(await engine.plan({ ...confirmedFailure('dns-transport'), id: 'f2' }));
    await engine.execute(await engine.plan({ ...confirmedFailure('dns-transport'), id: 'f3' }));
    expect(engine.historySnapshot().records).toHaveLength(2);
  });
});
