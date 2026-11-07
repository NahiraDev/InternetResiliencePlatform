import type { ActionExecutor, ActionPlanner, ActionValidator, ActionVerifier, DecisionProvider, ObservationProvider, RecoveryProvider } from './ports/ports.js';
import { RuntimeAdapterRegistry } from './adapter-registry.js';
export type CoreIntegrationIssueCode = 'missing-live-adapter' | 'duplicate-observation-provider';
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
export declare const inspectCoreIntegration: (composition: CoreIntegrationComposition) => CoreIntegrationReport;
//# sourceMappingURL=core-integration.d.ts.map