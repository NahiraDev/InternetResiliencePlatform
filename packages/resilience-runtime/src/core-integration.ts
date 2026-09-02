import type {
  ActionExecutor,
  ActionPlanner,
  ActionValidator,
  ActionVerifier,
  DecisionProvider,
  ObservationProvider,
  RecoveryProvider,
} from './ports/ports.js';
import { RuntimeAdapterRegistry } from './adapter-registry.js';

export type CoreIntegrationIssueCode =
  | 'missing-live-adapter'
  | 'duplicate-observation-provider';

export interface CoreIntegrationIssue {
  readonly code: CoreIntegrationIssueCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CoreIntegrationComposition {
  readonly observations: readonly ObservationProvider[];
  readonly decision: DecisionProvider;
  readonly planner: ActionPlanner;
  readonly validator: ActionValidator;
  readonly executor: ActionExecutor;
  readonly verifier: ActionVerifier;
  readonly recovery: RecoveryProvider;
  readonly adapters: RuntimeAdapterRegistry;
}

export interface CoreIntegrationReport {
  readonly connected: boolean;
  readonly issues: readonly CoreIntegrationIssue[];
  readonly observationProviderIds: readonly string[];
  readonly liveAdapterIds: readonly string[];
}

/**
 * Performs a deterministic composition check for the runtime control loop.
 *
 * The check is intentionally metadata-driven: it proves that the assembled
 * components expose an unambiguous observation set and at least one adapter
 * capable of live mutations, without executing a network-changing action.
 */
export const inspectCoreIntegration = (
  composition: CoreIntegrationComposition,
): CoreIntegrationReport => {
  const issues: CoreIntegrationIssue[] = [];

  const observationProviderIds = composition.observations.map((provider) => provider.id);
  const duplicateIds = [...new Set(
    observationProviderIds.filter(
      (id, index) => observationProviderIds.indexOf(id) !== index,
    ),
  )];

  for (const id of duplicateIds) {
    issues.push({
      code: 'duplicate-observation-provider',
      message: `Observation provider '${id}' is registered more than once`,
      details: { providerId: id },
    });
  }

  const liveAdapterIds = composition.adapters
    .list()
    .filter((descriptor) => descriptor.supportsLive && descriptor.supportedActions.length > 0)
    .map((descriptor) => descriptor.adapterId);

  if (liveAdapterIds.length === 0) {
    issues.push({
      code: 'missing-live-adapter',
      message: 'The runtime composition has no adapter capable of live mutations',
    });
  }

  return {
    connected: issues.length === 0,
    issues,
    observationProviderIds,
    liveAdapterIds,
  };
};
