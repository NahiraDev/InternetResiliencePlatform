import { describe, expect, it } from 'vitest';
import { assessDaemon, EXIT, summarizeDecision } from './diagnostics.js';

const goodHealth = {
  lifecycle: 'running',
  authorization: { requestedMode: 'safe', effectiveMode: 'safe', liveActive: false, blockers: [] },
  storage: { persistent: true },
  scheduler: { enabled: true },
  recovery: { dnsRestorePending: false },
};
const healthy = { health: { status: 'healthy' } };

describe('summarizeDecision', () => {
  it('separates simulated, executed and verified execution', () => {
    const base = { decisionId: 'd', outcome: 'success', selectedPlan: { selectedAction: { intent: 'route_change' } } };
    expect(summarizeDecision({ ...base, executionResult: { status: 'success', simulated: true } }).execution).toBe('simulated');
    const executedOnly = summarizeDecision({ ...base, executionResult: { status: 'success', simulated: false }, verificationResult: { status: 'failed' } });
    expect(executedOnly.execution).toBe('executed');
    expect(executedOnly.executedAndVerified).toBe(false);
    const both = summarizeDecision({ ...base, executionResult: { status: 'success', simulated: false }, verificationResult: { status: 'success' } });
    expect(both.executedAndVerified).toBe(true);
    // Verification of a simulated run never counts as real verified execution.
    expect(summarizeDecision({ ...base, executionResult: { status: 'success', simulated: true }, verificationResult: { status: 'success' } }).executedAndVerified).toBe(false);
  });
  it('surfaces the exact policy reasons for a blocked decision', () => {
    const s = summarizeDecision({ outcome: 'blocked', policyEvaluation: { allowed: false, reasons: ['action route_change is not allowed', 'missing capabilities: route.write'] } });
    expect(s.blockedBecause).toEqual(['action route_change is not allowed', 'missing capabilities: route.write']);
  });
  it('tolerates junk input', () => {
    expect(summarizeDecision(null).execution).toBe('none');
    expect(summarizeDecision('x').blockedBecause).toEqual([]);
  });
});

describe('assessDaemon', () => {
  it('is healthy only with positive health evidence', () => {
    const a = assessDaemon({ health: goodHealth, snapshot: healthy, decisions: [{ outcome: 'noop' }] });
    expect(a.state).toBe('healthy');
    expect(a.exitCode).toBe(EXIT.ok);
    const unknown = assessDaemon({ health: goodHealth, snapshot: { health: { status: 'unknown', reason: 'no verified healthy evidence' } }, decisions: [] });
    expect(unknown.state).toBe('unknown');
    expect(unknown.exitCode).toBe(EXIT.degraded);
  });
  it('reports a blocked runtime with the policy reasons and a distinct exit code', () => {
    const a = assessDaemon({ health: goodHealth, snapshot: healthy, decisions: [{ outcome: 'blocked', policyEvaluation: { allowed: false, reasons: ['security context or capability snapshot is untrusted'] } }] });
    expect(a.state).toBe('blocked');
    expect(a.exitCode).toBe(EXIT.blocked);
    expect(a.findings.map((f) => f.message).join(' ')).toMatch(/untrusted/);
  });
  it('flags a live request the host did not authorize', () => {
    const a = assessDaemon({
      health: { ...goodHealth, authorization: { requestedMode: 'live', effectiveMode: 'safe', liveActive: false, blockers: ['process lacks CAP_NET_ADMIN'] } },
      snapshot: healthy, decisions: [],
    });
    expect(a.state).toBe('degraded');
    expect(a.summary).toMatchObject({ requestedMode: 'live', effectiveMode: 'safe', liveActive: false });
    expect(a.findings[0]).toMatchObject({ code: 'host-authorization', hint: expect.stringContaining('observe-only') });
  });
  it('warns that in-memory state is volatile and a failed runtime is not healthy', () => {
    const a = assessDaemon({ health: { ...goodHealth, storage: { persistent: false } }, snapshot: { health: { status: 'failed', reason: 'runtime cycle failed' } }, decisions: [] });
    expect(a.summary.storage).toBe('in-memory');
    expect(a.state).toBe('degraded');
    expect(a.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['volatile-state', 'runtime-failed']));
  });
  it('treats a non-running lifecycle as an error', () => {
    const a = assessDaemon({ health: { ...goodHealth, lifecycle: 'stopping' }, snapshot: healthy, decisions: [] });
    expect(a.state).not.toBe('healthy');
  });
});
