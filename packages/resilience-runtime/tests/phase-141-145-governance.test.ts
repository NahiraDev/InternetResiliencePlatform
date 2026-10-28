import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIVACY_POLICY, DEFAULT_RETENTION, ImmutableHistory, PrivacyBudget, Pseudonymizer, assessControls, canFlow, checkAccessReview, checkPurposeLimitation,
  checkSeparationOfDuties, coarsenAddress, combineClasses, deletionReceipt, gapReport, kAnonymize, minimizeRecord, noisyCount, planDeletion, runGovernanceReview,
  sealEvidenceBundle, validateRetention, verifyEvidenceBundle, type ControlDefinition, type EvidenceItem, type GovernancePolicy, type HistoryEntry,
} from '../src/index.js';

const DAY = 86_400_000;

describe('Phase 141 privacy telemetry', () => {
  it('minimizes records deny-by-default and rotates pseudonyms', () => {
    const ps = new Pseudonymizer('k', DAY);
    const policy = { ...DEFAULT_PRIVACY_POLICY, fields: { device: 'pseudonymize', ip: 'coarsen-ip', at: 'bucket-time', rtt: 'keep' } as const };
    const rec = { device: 'dev-1', ip: '203.0.113.77', at: 125_000, rtt: 20, email: 'a@b.c' };
    const out = minimizeRecord(rec, policy, ps, 1000);
    expect(out).toMatchObject({ ip: '203.0.113.0/24', at: 120_000, rtt: 20 });
    expect(out).not.toHaveProperty('email');
    expect(minimizeRecord(rec, policy, ps, 2000).device).toBe(out.device);
    expect(minimizeRecord(rec, policy, ps, DAY + 5).device).not.toBe(out.device);
    expect(coarsenAddress('2001:db8:1:2::9', 24, 48)).toBe('2001:db8:1::/48');
  });
  it('suppresses small groups and bounds noise budget', () => {
    const r = kAnonymize([{ key: 'a', count: 10 }, { key: 'b', count: 2 }], 5);
    expect(r.released).toHaveLength(1); expect(r.suppressedTotal).toBe(2);
    expect(noisyCount(10, 1, () => 0.5)).toBe(10);
    expect(noisyCount(10, 1, () => 0.999)).toBeGreaterThan(10);
    const b = new PrivacyBudget(1); expect(b.spend(0.6)).toBe(true); expect(b.spend(0.6)).toBe(false); expect(b.remaining()).toBeCloseTo(0.4);
  });
});

describe('Phase 142 data lifecycle', () => {
  it('plans deletion respecting holds and erasure', () => {
    expect(validateRetention(DEFAULT_RETENTION)).toEqual([]);
    expect(validateRetention([{ dataClass: 'public', retainMs: 1, maxRetainMs: 1 }]).length).toBeGreaterThan(0);
    const recs = [
      { id: 'a', dataClass: 'restricted', createdAtMs: 0 }, { id: 'b', dataClass: 'restricted', createdAtMs: 0, tenant: 't1' },
      { id: 'c', dataClass: 'restricted', createdAtMs: 40 * DAY - 1 }, { id: 'd', dataClass: 'public', createdAtMs: 0, subject: 'u9' },
    ] as const;
    const p = planDeletion(recs, DEFAULT_RETENTION, [{ id: 'h1', reason: 'case', tenant: 't1' }], 40 * DAY, ['u9']);
    expect(p.delete).toEqual(['a', 'd']); expect(p.held).toEqual([{ id: 'b', holdId: 'h1' }]); expect(p.retained).toEqual(['c']);
    expect(deletionReceipt(recs[0], 1, 'retention-expired').digest).toHaveLength(64);
    expect(combineClasses(['internal', 'restricted'])).toBe('restricted');
    expect(canFlow('restricted', 'public')).toBe(false);
  });
});

describe('Phase 143 immutable history', () => {
  const mk = () => { const h = new ImmutableHistory('seal'); for (let i = 0; i < 5; i += 1) h.append({ atMs: i, actor: 'op', action: 'apply', subject: `s${i}`, outcome: 'applied', detail: { n: i } }); return h; };
  it('detects edits, deletions and reordering', () => {
    const h = mk(); expect(h.verify()).toEqual({ ok: true, entries: 5 });
    const e = [...h.all()];
    expect(h.verify(e.map((x, i) => i === 2 ? { ...x, actor: 'evil' } as HistoryEntry : x))).toMatchObject({ ok: false, reason: 'hash-mismatch', index: 2 });
    expect(h.verify([e[0]!, e[1]!, e[3]!, e[4]!])).toMatchObject({ ok: false, reason: 'index-gap' });
    expect(h.verify([e[1]!, e[0]!, ...e.slice(2)])).toMatchObject({ ok: false });
    const forged = e.map((x, i) => i === 1 ? { ...x, seal: 'f'.repeat(64) } : x);
    expect(h.verify(forged)).toMatchObject({ reason: 'bad-seal' });
  });
  it('checkpoints, prunes and keeps verifying', () => {
    const h = mk(); const cp = h.checkpoint(99);
    expect(h.prune(cp)).toBe(5);
    h.append({ atMs: 10, actor: 'op', action: 'x', subject: 's', outcome: 'allowed' });
    expect(h.verify()).toEqual({ ok: true, entries: 1 });
    expect(h.all()[0]!.index).toBe(5);
    expect(() => h.prune({ ...cp, hash: 'bad' })).toThrow();
    expect(h.query({ action: 'x' })).toHaveLength(1);
  });
});

describe('Phase 144 governance controls', () => {
  const policy: GovernancePolicy = {
    conflictingCapabilities: [['approve', 'apply']], staleAfterMs: 90 * DAY, maxBreakGlassMs: DAY, maxGrantsPerActor: 3,
    allowedPurposes: { public: ['any'], internal: ['ops'], confidential: ['ops'], restricted: ['incident'] } as never,
  };
  it('flags conflicts, misuse, stale and break-glass access', () => {
    const now = 200 * DAY;
    const grants = [
      { actor: 'a', capability: 'approve', grantedAtMs: now }, { actor: 'a', capability: 'apply', grantedAtMs: now },
      { actor: 'b', capability: 'read', grantedAtMs: 0 }, { actor: 'c', capability: 'root', grantedAtMs: now, breakGlass: true },
    ];
    expect(checkSeparationOfDuties(grants, policy, now)).toHaveLength(1);
    expect(checkPurposeLimitation([{ actor: 'x', dataClass: 'restricted', purpose: 'marketing', atMs: 0 }], policy)[0]?.severity).toBe('critical');
    expect(checkAccessReview(grants, policy, now).map((f) => f.control).sort()).toEqual(['break-glass', 'stale-access']);
    const r = runGovernanceReview(grants, [], policy, now);
    expect(r.pass).toBe(false); expect(r.findings[0]?.severity).toBe('critical');
    expect(runGovernanceReview([{ actor: 'z', capability: 'read', grantedAtMs: now }], [], policy, now).pass).toBe(true);
  });
});

describe('Phase 145 compliance evidence', () => {
  const controls: ControlDefinition[] = [{ id: 'C1', title: 'backups', requiredEvidence: ['restore-test', 'schedule'], maxAgeMs: 30 * DAY }, { id: 'C2', title: 'audit', requiredEvidence: ['chain-verify'], maxAgeMs: DAY }];
  const ev = (o: Partial<EvidenceItem>): EvidenceItem => ({ id: 'e', kind: 'schedule', controlIds: ['C1'], collectedAtMs: 100 * DAY, result: 'pass', digest: 'd', source: 's', ...o });
  it('assesses status, builds sealed bundle and gap report', () => {
    const now = 100 * DAY;
    const items = [ev({ id: 'e1' }), ev({ id: 'e2', kind: 'restore-test', collectedAtMs: 10 * DAY }), ev({ id: 'e3', kind: 'chain-verify', controlIds: ['C2'], result: 'fail' })];
    const a = assessControls(controls, items, now);
    expect(a.map((x) => x.status)).toEqual(['stale-evidence', 'failing']);
    expect(gapReport(a)).toEqual(['C1: refresh restore-test evidence', 'C2: remediate failing evidence e3']);
    const b = sealEvidenceBundle(controls, items, now, 'k');
    expect(b.coverage).toBe(0); expect(verifyEvidenceBundle(b, 'k')).toBe(true);
    expect(verifyEvidenceBundle(b, 'other')).toBe(false);
    expect(verifyEvidenceBundle({ ...b, evidence: b.evidence.slice(1) }, 'k')).toBe(false);
    expect(assessControls(controls, [ev({ kind: 'restore-test', id: 'x' }), ev({ id: 'y' }), ev({ id: 'z', kind: 'chain-verify', controlIds: ['C2'] })], now).every((x) => x.status === 'satisfied')).toBe(true);
  });
});
