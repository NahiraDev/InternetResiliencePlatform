import { describe, expect, it } from 'vitest';
import {
  AdaptiveConcurrencyLimiter, BoundedPriorityQueue, CircuitBreaker, ConsistentHashRing, FencedResource, ObservedRemoveSet, REQUIRED_DRILLS, REQUIRED_INVARIANTS,
  ReplicaGroup, ReplicatedMap, RestoreError, TokenBucket, assessPlatformReadiness, compareVectors, createBackup, evaluateRecovery, planRegionalFailover,
  restoreBackup, scanForbiddenSymbols, verifyChunks, type PhaseEvidence,
} from '../src/index.js';

describe('Phase 146 HA', () => {
  it('elects with quorum, fences old leaders and fails safe without quorum', () => {
    const g = new ReplicaGroup(3, 100);
    g.heartbeat('a', 1, 0); g.heartbeat('b', 2, 0);
    let v = g.evaluate(10);
    expect(v).toMatchObject({ leaderId: 'a', hasQuorum: true, term: 1 });
    expect(g.acceptWrite('a', v.fencingToken, 10)).toBe(true);
    expect(g.acceptWrite('b', v.fencingToken, 10)).toBe(false);
    g.heartbeat('b', 2, 150); g.heartbeat('c', 3, 150);
    v = g.evaluate(160);
    expect(v.leaderId).toBe('b'); expect(v.term).toBe(2);
    expect(g.acceptWrite('a', 1, 160)).toBe(false);
    v = g.evaluate(1000);
    expect(v).toMatchObject({ hasQuorum: false }); expect(v.leaderId).toBeUndefined();
    const r = new FencedResource<string>(); expect(r.write(2, 'x')).toBe(true); expect(r.write(1, 'old')).toBe(false); expect(r.read()).toBe('x');
  });
});

describe('Phase 147 consistency', () => {
  it('detects concurrency, converges and reports conflicts', () => {
    const a = new ReplicatedMap<string>('a'); const b = new ReplicatedMap<string>('b');
    a.set('k', 'A', 10); b.set('k', 'B', 20);
    expect(compareVectors(a.entry('k')!.vector, b.entry('k')!.vector)).toBe('concurrent');
    a.merge(b.snapshot()); b.merge(a.snapshot());
    expect(a.get('k')).toBe('B'); expect(b.get('k')).toBe('B');
    expect(a.conflicts).toHaveLength(1);
    a.set('k', 'C', 30); b.merge(a.snapshot());
    expect(b.get('k')).toBe('C'); expect(b.conflicts.length).toBe(0);
    expect(b.merge(a.snapshot())).toEqual([]);
  });
  it('add-wins observed-remove set', () => {
    const x = new ObservedRemoveSet('x'); const y = new ObservedRemoveSet('y');
    x.add('e'); y.merge(x.state()); y.remove('e'); x.add('e');
    x.merge(y.state()); y.merge(x.state());
    expect(x.elements()).toEqual(['e']); expect(y.elements()).toEqual(['e']);
  });
});

describe('Phase 148 backpressure', () => {
  it('token bucket refills', () => {
    const t = new TokenBucket(2, 1, 0);
    expect(t.tryTake(2, 0)).toBe(true); expect(t.tryTake(1, 0)).toBe(false); expect(t.waitMs(1, 0)).toBe(1000); expect(t.tryTake(1, 1000)).toBe(true);
  });
  it('queue sheds lowest priority but never protected work', () => {
    const q = new BoundedPriorityQueue<string>(2, 1);
    q.enqueue({ id: 'low', priority: 9, payload: '' }); q.enqueue({ id: 'mid', priority: 5, payload: '' });
    expect(q.enqueue({ id: 'lower', priority: 10, payload: '' })).toEqual({ accepted: false, reason: 'queue-full' });
    const r = q.enqueue({ id: 'hi', priority: 1, payload: '' });
    expect(r).toMatchObject({ accepted: true, shed: { id: 'low' } });
    expect(q.enqueue({ id: 'ctl', priority: 99, payload: '', protectedWork: true }).accepted).toBe(true);
    expect(q.dequeue()?.id).toBe('ctl');
    expect(q.dequeue()?.id).toBe('hi');
  });
  it('limiter, breaker and ring behave', () => {
    const l = new AdaptiveConcurrencyLimiter(1, 10, 100, 8);
    expect(l.tryAcquire()).toBe(true); l.release(500, false); expect(l.limit).toBe(4);
    const b = new CircuitBreaker(2, 100);
    b.failure(0); b.failure(0); expect(b.allow(50)).toBe(false); expect(b.allow(150)).toBe(true); expect(b.allow(150)).toBe(false); b.success(); expect(b.current).toBe('closed');
    const ring = new ConsistentHashRing(); ['n1', 'n2', 'n3'].forEach((n) => ring.add(n));
    const before = new Map(Array.from({ length: 300 }, (_, i) => [`k${i}`, ring.owner(`k${i}`)]));
    ring.remove('n3');
    const moved = [...before].filter(([k, o]) => o !== 'n3' && ring.owner(k) !== o).length;
    expect(moved).toBe(0);
    expect(new ConsistentHashRing().owner('x')).toBeUndefined();
  });
});

describe('Phase 149 DR', () => {
  const meta = { backupId: 'b1', createdAtMs: 1000, region: 'eu' };
  it('round-trips and detects corruption, wrong key and metadata tampering', () => {
    const data = Buffer.from('state'.repeat(1000));
    const bk = createBackup(data, 'master', meta, 512);
    expect(restoreBackup(bk, 'master').equals(data)).toBe(true);
    expect(() => restoreBackup(bk, 'wrong')).toThrow(RestoreError);
    const bad = Buffer.from(bk.ciphertext); bad[700] ^= 1;
    expect(verifyChunks({ ...bk, ciphertext: bad }).corruptChunks).toEqual([1]);
    expect(() => restoreBackup({ ...bk, ciphertext: bad }, 'master')).toThrow(/corrupt/);
    expect(() => restoreBackup({ ...bk, manifest: { ...bk.manifest, region: 'us' } }, 'master')).toThrow(/authentication/);
  });
  it('evaluates RPO/RTO and plans failover safely', () => {
    expect(evaluateRecovery({ rpoMs: 100, rtoMs: 100 }, 0, 50, 200)).toMatchObject({ rpoMet: true, rtoMet: false });
    const obj = { rpoMs: 1000, rtoMs: 1 };
    const regs = [{ region: 'a', healthy: false, replicaLagMs: 0, capacityHeadroom: 1, priority: 1 }, { region: 'b', healthy: true, replicaLagMs: 5000, capacityHeadroom: 1, priority: 1 }, { region: 'c', healthy: true, replicaLagMs: 10, capacityHeadroom: 0.1, priority: 1 }, { region: 'd', healthy: true, replicaLagMs: 20, capacityHeadroom: 0.6, priority: 2 }];
    expect(planRegionalFailover('a', regs, obj, 0.5)).toMatchObject({ action: 'failover', target: 'd' });
    expect(planRegionalFailover('a', regs.slice(0, 3), obj, 0.5).action).toBe('blocked');
    expect(planRegionalFailover('a', [{ ...regs[0]!, healthy: true }], obj, 0.5).action).toBe('stay');
  });
});

describe('Phase 150 readiness', () => {
  const phases = (ci?: string): PhaseEvidence[] => Array.from({ length: 3 }, (_, i) => ({ phase: i + 148, implemented: true, testsPassed: true, docPresent: true, ...(ci ? { ciSha: ci } : {}) }));
  const inv = REQUIRED_INVARIANTS.map((id) => ({ id, description: id, holds: true }));
  const drills = REQUIRED_DRILLS.map((kind) => ({ id: kind, kind, passed: true, atMs: 100 }));
  const base = { firstPhase: 148, lastPhase: 150, phases: phases(), invariants: inv, drills, drillMaxAgeMs: 1000, nowMs: 200 };
  it('derives verdicts rather than asserting them', () => {
    expect(assessPlatformReadiness(base).verdict).toBe('PARTIAL');
    expect(assessPlatformReadiness({ ...base, phases: phases('sha1'), expectedCiSha: 'sha1' }).verdict).toBe('READY');
    expect(assessPlatformReadiness({ ...base, invariants: inv.slice(1) }).verdict).toBe('NOT-READY');
    expect(assessPlatformReadiness({ ...base, phases: phases('s').slice(1), expectedCiSha: 's' }).blockers).toContain('phase 148: no evidence');
    expect(assessPlatformReadiness({ ...base, phases: phases('s'), expectedCiSha: 's', drills: [], }).verdict).toBe('PARTIAL');
    expect(assessPlatformReadiness({ ...base, phases: phases('s'), expectedCiSha: 's', nowMs: 99_999 }).partials.some((p) => p.includes('stale'))).toBe(true);
  });
  it('scans for forbidden symbols only on import/export lines', () => {
    const hits = scanForbiddenSymbols({ 'a.ts': "import { EventBus } from 'x';\n// EventBus mention\nconst EventBusy = 1;", 'b.ts': "export { Planner } from './p';" }, ['EventBus', 'Planner']);
    expect(hits).toEqual([{ file: 'a.ts', symbol: 'EventBus', line: 1 }, { file: 'b.ts', symbol: 'Planner', line: 1 }]);
  });
});
