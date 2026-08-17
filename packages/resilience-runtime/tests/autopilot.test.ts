import { describe, expect, it } from 'vitest';
import {
  NetworkAutopilot,
  AutopilotStateMachine,
  createAutopilotPolicy,
  TruthfulObservationProvider,
} from '../src/index.js';

describe('Phase 26 Network Autopilot control loop', () => {
  it('rejects invalid state transitions explicitly', () => {
    const sm = new AutopilotStateMachine();
    expect(() => sm.transition('APPLYING')).toThrow('Invalid autopilot transition');
    expect(sm.transition('OBSERVING')).toBe('OBSERVING');
  });
  it('defaults to safe observe-only and blocks execution while recording decision path', async () => {
    const ap = new NetworkAutopilot([new TruthfulObservationProvider('dns', 'dns', 'degraded')]);
    const run = await ap.run();
    expect(run.state).toBe('BLOCKED');
    expect(run.policyEvaluation?.outcome).toBe('REQUIRE_APPROVAL');
    expect(run.decision?.selected_action?.action_type).toBe('DNS_SWITCH');
  });
  it('executes a governed autonomous simulated DNS remediation and verifies recovery', async () => {
    const ap = new NetworkAutopilot(
      [new TruthfulObservationProvider('dns', 'dns', 'failed')],
      createAutopilotPolicy({
        enabled: true,
        mode: 'AUTONOMOUS',
        allowedActions: ['DNS_SWITCH', 'PROBE_REFRESH', 'CACHE_REFRESH'],
      }),
    );
    const run = await ap.run();
    expect(run.state).toBe('SUCCEEDED');
    expect(run.outcome?.status).toBe('SUCCESS');
    expect(run.verification?.status).toBe('PASS');
    expect(run.actionResult?.before_state?.checksum).toContain('snapshot-');
  });
  it('rolls back when verification fails and records recovery', async () => {
    const ap = new NetworkAutopilot(
      [new TruthfulObservationProvider('dns', 'dns', 'failed')],
      createAutopilotPolicy({ enabled: true, mode: 'AUTONOMOUS', allowedActions: ['DNS_SWITCH'] }),
    );
    const run = await ap.run({ forceVerificationFailure: true });
    expect(run.state).toBe('RECOVERED');
    expect(run.outcome?.status).toBe('ROLLED_BACK');
    expect(run.rollback?.status).toBe('COMPLETED');
  });
  it('supports dry-run and shadow mode without applying actions', async () => {
    const ap = new NetworkAutopilot(
      [new TruthfulObservationProvider('dns', 'dns', 'failed')],
      createAutopilotPolicy({ enabled: true, mode: 'AUTONOMOUS', allowedActions: ['DNS_SWITCH'] }),
    );
    await expect(ap.run({ dryRun: true })).resolves.toMatchObject({
      outcome: { status: 'DRY_RUN' },
    });
    await expect(ap.run({ shadow: true })).resolves.toMatchObject({
      outcome: { status: 'SHADOW' },
    });
  });
  it('exposes action catalog, policy, status, and audit events', async () => {
    const ap = new NetworkAutopilot(
      [new TruthfulObservationProvider('dns', 'dns', 'failed')],
      createAutopilotPolicy({ enabled: true, mode: 'CANARY', allowedActions: ['DNS_SWITCH'] }),
    );
    const run = await ap.run();
    expect(ap.actions()).toContain('DNS_SWITCH');
    expect(ap.policies().mode).toBe('CANARY');
    expect(ap.status().circuitBreaker).toBe('CLOSED');
    expect(run.policyEvaluation?.outcome).toBe('ALLOW_WITH_LIMITS');
    expect(run.events).toContain('autopilot.verification.completed');
  });
});
