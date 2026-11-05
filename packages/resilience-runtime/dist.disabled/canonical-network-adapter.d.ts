import { ConnectivityManager } from '@irp/connectivity';
import type { GatewayProbeEvidence } from '@irp/gateway-registry';
import type { TunnelConfiguration } from '@irp/tunnel';
import { RoutingEngine, type RoutingDestination } from '@irp/routing';
import type { ActionExecution, ActionPlan, ActionVerification, RuntimeContext } from './domain/types.js';
import { type RuntimeAdapter, type RuntimeAdapterDescriptor } from './adapter-registry.js';
export interface CanonicalDnsProvider {
    readonly id: string;
    readonly name: string;
    readonly health: () => Promise<unknown>;
}
export interface CanonicalDnsProviderScore {
    readonly provider: CanonicalDnsProvider;
    readonly score: number;
    readonly rank: number;
    readonly prediction: {
        expectedLatencyMs?: number;
        failureProbability?: number;
    };
}
export interface CanonicalDnsControlPlane {
    readonly engine: {
        evaluate(): Promise<CanonicalDnsProviderScore[]>;
        status(): {
            activeProviderId: string | undefined;
            providers: CanonicalDnsProviderScore[];
        };
    };
    readonly applyProvider: (provider: CanonicalDnsProvider) => Promise<void>;
    readonly getActiveProviderId?: () => string | undefined;
}
export interface CanonicalTunnelControlPlane {
    /** Active tunnel ID when a provider connection is currently tracked. */
    readonly activeTunnel?: string | undefined;
    /** Managed tunnel ID remains available for recovery when its last connect failed. */
    readonly managedTunnel?: string | undefined;
    readonly connect: (request?: {
        providerId?: string;
        configuration?: TunnelConfiguration;
    }) => Promise<{
        tunnelId: string;
        providerId: string;
        connectionId: string;
    }>;
    /** Reconnects the existing managed tunnel without creating a second tunnel object. */
    readonly reconnect?: (request?: {
        providerId?: string;
        tunnelId?: string;
    }) => Promise<{
        tunnelId: string;
        providerId: string;
        connectionId: string;
    }>;
    readonly verify: (tunnelId: string) => Promise<boolean>;
    readonly rollback: () => Promise<boolean>;
    readonly configured: boolean;
}
export interface CanonicalGatewaySelectionCandidate {
    readonly gatewayId: string;
    readonly eligible: boolean;
    readonly score: number;
    readonly rejectionReason?: string;
    readonly explanation: readonly string[];
}
export interface CanonicalGatewaySelectionDecision {
    readonly selectedGatewayId: string | undefined;
    readonly switched: boolean;
    readonly reason: string;
    readonly candidates: readonly CanonicalGatewaySelectionCandidate[];
    /**
     * What the decision itself is based on.
     *
     * A selection decision is a plan, not an operational claim: `transport` evidence means the
     * gateway still has to be established, routed and verified before it may be reported as
     * operational.
     */
    readonly evidence?: GatewayProbeEvidence;
}
/** The proven result of establishing a gateway: tunnel, route and external egress. */
export interface CanonicalGatewayApplyResult {
    readonly gatewayId: string;
    readonly previousSourceId: string | undefined;
    readonly tunnelId?: string;
    readonly routePlanId?: string;
    readonly destination?: string;
    /** True only when an external destination was actually reached through the gateway. */
    readonly egressVerified: boolean;
    readonly latencyMs?: number;
    readonly service?: string;
}
export interface CanonicalGatewaySelectionPlane {
    readonly configured: boolean;
    readonly currentGatewayId: string | undefined;
    readonly gateways: () => readonly unknown[];
    synchronize(): Promise<void>;
    evaluate(): Promise<CanonicalGatewaySelectionDecision>;
    /**
     * Probe each gateway endpoint with real network measurements, then run
     * gateway selection using observed health evidence. Required when the
     * runtime needs true destination reachability before selecting a gateway.
     */
    probeAndEvaluate?(): Promise<CanonicalGatewaySelectionDecision>;
    /**
     * Establishes the selected gateway: tunnel, route through the tunnel, external destination
     * verification and the connectivity source switch. Implementations must compensate every
     * mutation when a later step fails, and must throw when the gateway could not be proven.
     */
    apply(gatewayId: string, context?: RuntimeContext): Promise<CanonicalGatewayApplyResult>;
    /** Reverts an established gateway (source switch, route and tunnel). */
    rollback?(gatewayId: string): Promise<boolean>;
}
export interface CanonicalDestinationOutcome {
    readonly status: 'reachable' | 'degraded' | 'failed' | 'unknown';
    readonly service?: string;
    readonly latencyMs?: number;
    readonly reason?: string;
}
export interface CanonicalNetworkControlPlane {
    readonly connectivity: ConnectivityManager;
    readonly routing: RoutingEngine;
    readonly dns?: CanonicalDnsControlPlane;
    readonly tunnel?: CanonicalTunnelControlPlane;
    readonly gatewaySelection?: CanonicalGatewaySelectionPlane;
    readonly destination?: RoutingDestination;
    readonly verifyDestination?: (destination: RoutingDestination, context: RuntimeContext) => Promise<CanonicalDestinationOutcome>;
}
export declare class CanonicalNetworkRuntimeAdapter implements RuntimeAdapter {
    private readonly controlPlane;
    private readonly previousDnsProviders;
    private readonly appliedRoutePlans;
    private readonly rolledBackRoutePlans;
    private readonly appliedGateways;
    readonly descriptor: RuntimeAdapterDescriptor;
    constructor(controlPlane: CanonicalNetworkControlPlane);
    private verifyDestinationOutcome;
    execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
    verify(plan: ActionPlan, execution: ActionExecution, context: RuntimeContext): Promise<ActionVerification>;
    verifyRollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionVerification>;
    rollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
}
//# sourceMappingURL=canonical-network-adapter.d.ts.map