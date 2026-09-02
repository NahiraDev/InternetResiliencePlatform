import { describe, expect, it } from 'vitest';
import { createDefaultRuntimeAdapterRegistry } from '../src/adapter-registry.js';
import { inspectCoreIntegration } from '../src/core-integration.js';
import { DeterministicPlanner } from '../src/planning/planner.js';
import { RuntimeActionValidator } from '../src/validation/validation.js';
import { CoordinatedActionExecutor } from '../src/execution/execution.js';
import { RuntimeActionVerifier } from '../src/verification/verification.js';
import { FailoverRecoveryProvider } from '../src/recovery/recovery.js';
import { SubsystemDecisionAdapter } from '../src/adapters/adapters.js';
import { TruthfulObservationProvider } from '../src/observation-providers.js';

describe('core integration evidence gate', () => {
  it('rejects a composition that cannot perform live mutations', () => {
    const adapters = createDefaultRuntimeAdapterRegistry();
    const report = inspectCoreIntegration({
      observations: [new TruthfulObservationProvider('connectivity', 'connectivity')],
      decision: new SubsystemDecisionAdapter(),
      planner: new DeterministicPlanner(),
      validator: new RuntimeActionValidator(undefined, adapters),
      executor: new CoordinatedActionExecutor(adapters),
      verifier: new RuntimeActionVerifier(adapters),
      recovery: new FailoverRecoveryProvider(adapters),
      adapters,
    });

    expect(report.connected).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'missing-live-adapter')).toBe(true);
  });

  it('detects duplicate observation registration instead of silently accepting it', () => {
    const adapters = createDefaultRuntimeAdapterRegistry();
    const provider = new TruthfulObservationProvider('connectivity', 'connectivity');
    const report = inspectCoreIntegration({
      observations: [provider, provider],
      decision: new SubsystemDecisionAdapter(),
      planner: new DeterministicPlanner(),
      validator: new RuntimeActionValidator(undefined, adapters),
      executor: new CoordinatedActionExecutor(adapters),
      verifier: new RuntimeActionVerifier(adapters),
      recovery: new FailoverRecoveryProvider(adapters),
      adapters,
    });

    expect(report.issues.some((issue) => issue.code === 'duplicate-observation-provider')).toBe(true);
  });
});
