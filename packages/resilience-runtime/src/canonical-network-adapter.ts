import { ConnectivityManager, type ConnectivitySource } from '@irp/connectivity';
import type { GatewayProbeEvidence } from '@irp/gateway-registry';
import type { TunnelConfiguration } from '@irp/tunnel';
import {
  RoutingEngine,
  parseDestination,
  type RoutePlan,
  type RoutingDestination,
} from '@irp/routing';
import type {
  ActionExecution,
  ActionPlan,
  ActionVerification,
  RuntimeContext,
} from './domain/types.js';
import {
  createAdapterExecution,
  createAdapterVerification,
  type RuntimeAdapter,
  type RuntimeAdapterDescriptor,
} from './adapter-registry.js';

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
  readonly reconnect?: (request?: { providerId?: string; tunnelId?: string }) => Promise<{
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
  readonly verifyDestination?: (
    destination: RoutingDestination,
    context: RuntimeContext,
  ) => Promise<CanonicalDestinationOutcome>;
}

const destinationFromPlan = (
  plan: ActionPlan,
  fallback?: RoutingDestination,
): RoutingDestination => {
  const metadata = plan.selectedAction.metadata as Record<string, unknown>;
  const value = metadata.destination;
  if (typeof value === 'string') return parseDestination(value);
  if (value && typeof value === 'object') return value as RoutingDestination;
  return fallback ?? parseDestination('0.0.0.0');
};

const providerIdFromPlan = (plan: ActionPlan): string | undefined => {
  const metadata = plan.selectedAction.metadata as Record<string, unknown>;
  return typeof metadata.providerId === 'string' ? metadata.providerId : undefined;
};

const sourceMetadata = (source: ConnectivitySource | undefined) =>
  source
    ? {
        sourceId: source.sourceId,
        providerId: source.providerId,
        resourceId: source.id,
        interfaceName: source.interfaceName,
        gateway: source.gateway,
        score: source.score?.score,
      }
    : undefined;

const dnsSelectionMetadata = (
  ranked: CanonicalDnsProviderScore[],
  selected: CanonicalDnsProvider | undefined,
) => ({
  selectedProviderId: selected?.id,
  selectedProviderName: selected?.name,
  rankings: ranked.slice(0, 5).map((item) => ({
    providerId: item.provider.id,
    score: item.score,
    rank: item.rank,
    latencyMs: item.prediction.expectedLatencyMs,
    failureProbability: item.prediction.failureProbability,
  })),
});

export class CanonicalNetworkRuntimeAdapter implements RuntimeAdapter {
  private readonly previousDnsProviders = new Map<string, string | undefined>();
  private readonly appliedRoutePlans = new Map<string, RoutePlan>();
  private readonly rolledBackRoutePlans = new Map<string, RoutePlan>();
  private readonly appliedGateways = new Map<string, CanonicalGatewayApplyResult>();

  readonly descriptor: RuntimeAdapterDescriptor = {
    adapterId: 'canonical-network-control-plane',
    subsystem: 'connectivity',
    version: '1.2.0',
    capabilities: ['connectivity.failover', 'route.write', 'network.observe', 'dns.write'],
    supportedActions: ['connectivity_failover', 'provider_switch', 'route_change', 'dns_switch'],
    supportsSimulation: true,
    supportsSafe: true,
    supportsLive: true,
    requiredPermissions: ['network-control'],
    requiredKernelCapabilities: [],
    verificationSupport: true,
    recoverySupport: true,
  };

  constructor(private readonly controlPlane: CanonicalNetworkControlPlane) {}

  private async verifyDestinationOutcome(
    plan: ActionPlan,
    context: RuntimeContext,
    componentVerification: ActionVerification,
  ): Promise<ActionVerification> {
    if (componentVerification.status !== 'success') return componentVerification;

    // In live mode, destination-level verification is mandatory. An
    // unconfigured or unknown probe must fail the transaction (fail closed)
    // rather than falling back to weaker component-level checks.
    if (!this.controlPlane.verifyDestination) {
      if (context.mode === 'live') {
        return createAdapterVerification(plan, context, 'failed');
      }
      return componentVerification;
    }

    try {
      const outcome = await this.controlPlane.verifyDestination(
        destinationFromPlan(plan, this.controlPlane.destination),
        context,
      );
      return createAdapterVerification(
        plan,
        context,
        outcome.status === 'reachable' ? 'success' : 'failed',
      );
    } catch {
      return createAdapterVerification(plan, context, 'failed');
    }
  }

  async execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    if (context.mode !== 'live') return createAdapterExecution(plan, context, true);

    try {
      switch (plan.selectedAction.intent) {
        case 'connectivity_failover':
        case 'provider_switch': {
          await this.controlPlane.connectivity.discoverResources();
          if (this.controlPlane.gatewaySelection?.configured) {
            const gatewaySelection = this.controlPlane.gatewaySelection;
            await gatewaySelection.synchronize();
            // Use probe-based evaluation when a health probe is configured,
            // so gateway selection reflects real endpoint reachability rather
            // than only connectivity-source telemetry.
            const decision =
              typeof gatewaySelection.probeAndEvaluate === 'function'
                ? await gatewaySelection.probeAndEvaluate()
                : await gatewaySelection.evaluate();
            if (!decision.selectedGatewayId)
              return createAdapterExecution(plan, context, false, 'failed');
            const current = this.controlPlane.connectivity.getActiveSource()?.sourceId;
            // The gateway is always established, even when it is already the active source: a
            // gateway must never be reported operational merely because a source was selected.
            const applied = await gatewaySelection.apply(decision.selectedGatewayId, context);
            this.appliedGateways.set(plan.selectedAction.id, applied);
            const execution = createAdapterExecution(plan, context, false, 'success');
            return {
              ...execution,
              metadata: {
                ...execution.metadata,
                controlPlane: 'gateway-registry',
                transition: 'gateway-selection-and-failover',
                previousSourceId: current,
                selectedGatewayId: decision.selectedGatewayId,
                selectionReason: decision.reason,
                ...(applied.tunnelId ? { tunnelId: applied.tunnelId } : {}),
                ...(applied.routePlanId ? { routePlanId: applied.routePlanId } : {}),
                ...(applied.destination ? { verifiedDestination: applied.destination } : {}),
                gatewayEgressVerified: applied.egressVerified,
                candidates: decision.candidates.map((candidate) => ({
                  gatewayId: candidate.gatewayId,
                  eligible: candidate.eligible,
                  score: candidate.score,
                  ...(candidate.rejectionReason
                    ? { rejectionReason: candidate.rejectionReason }
                    : {}),
                })),
              },
            };
          }
          const evaluation = await this.controlPlane.connectivity.selectSource();
          const selected = evaluation.selected?.source;
          if (!selected) return createAdapterExecution(plan, context, false, 'failed');
          const current = evaluation.current?.sourceId;
          if (selected.sourceId !== current)
            await this.controlPlane.connectivity.switchSource(selected.sourceId);
          const execution = createAdapterExecution(plan, context, false, 'success');
          return {
            ...execution,
            metadata: {
              ...execution.metadata,
              controlPlane: 'connectivity',
              transition: 'source-selection-and-failover',
              previousSourceId: current,
              selectedSource: sourceMetadata(selected),
              selectionReason: evaluation.reason,
            },
          };
        }
        case 'route_change': {
          await this.controlPlane.connectivity.discoverResources();
          const sources = this.controlPlane.connectivity.getAvailableSources();
          const destination = destinationFromPlan(plan, this.controlPlane.destination);
          const decision = await this.controlPlane.routing.decide({
            destination,
            connectivitySources: sources,
          });
          if (!decision.selected || !decision.plan.selectedPath)
            return createAdapterExecution(plan, context, false, 'failed');
          const applied = await this.controlPlane.routing.applyPlan(decision.plan);
          const success = applied.verification.status === 'succeeded';
          const execution = createAdapterExecution(
            plan,
            context,
            false,
            success ? 'success' : 'failed',
          );
          if (success) this.appliedRoutePlans.set(plan.selectedAction.id, applied);
          return {
            ...execution,
            metadata: {
              ...execution.metadata,
              controlPlane: 'routing',
              destination,
              routePlanId: applied.id,
              selectedRouteId: decision.selected.route.id,
              verification: applied.verification.status,
            },
          };
        }
        case 'dns_switch': {
          const dns = this.controlPlane.dns;
          if (!dns) return createAdapterExecution(plan, context, false, 'failed');
          const requestedProviderId = providerIdFromPlan(plan);
          const previousProviderId =
            dns.getActiveProviderId?.() ?? dns.engine.status().activeProviderId;
          const ranked = await dns.engine.evaluate();
          const selected = requestedProviderId
            ? ranked.find((item) => item.provider.id === requestedProviderId)?.provider
            : ranked[0]?.provider;
          if (!selected) return createAdapterExecution(plan, context, false, 'failed');
          await dns.applyProvider(selected);
          this.previousDnsProviders.set(plan.selectedAction.id, previousProviderId);
          const execution = createAdapterExecution(plan, context, false, 'success');
          return {
            ...execution,
            metadata: {
              ...execution.metadata,
              controlPlane: 'dns',
              previousProviderId,
              ...dnsSelectionMetadata(ranked, selected),
            },
          };
        }
        default:
          return createAdapterExecution(plan, context, false, 'failed');
      }
    } catch (error) {
      const execution = createAdapterExecution(plan, context, false, 'failed');
      return {
        ...execution,
        error: error instanceof Error ? error.message : 'canonical network operation failed',
      };
    }
  }

  async verify(
    plan: ActionPlan,
    execution: ActionExecution,
    context: RuntimeContext,
  ): Promise<ActionVerification> {
    if (context.mode !== 'live') return createAdapterVerification(plan, context, 'success');

    try {
      if (
        plan.selectedAction.intent === 'connectivity_failover' ||
        plan.selectedAction.intent === 'provider_switch'
      ) {
        const active = this.controlPlane.connectivity.getActiveSource();
        if (!active) return createAdapterVerification(plan, context, 'failed');
        if (this.controlPlane.gatewaySelection?.configured) {
          const selectedGatewayId = execution.metadata.selectedGatewayId;
          if (typeof selectedGatewayId !== 'string' || active.sourceId !== selectedGatewayId)
            return createAdapterVerification(plan, context, 'failed');
          // The gateway must have been established and proven to carry traffic to an external
          // destination. A selected source or a connected transport is not enough.
          const applied = this.appliedGateways.get(plan.selectedAction.id);
          if (!applied || applied.gatewayId !== selectedGatewayId)
            return createAdapterVerification(plan, context, 'failed');
          if (!applied.egressVerified)
            return createAdapterVerification(plan, context, 'failed');
          if (applied.tunnelId) {
            const tunnelHealthy = await this.controlPlane.tunnel
              ?.verify(applied.tunnelId)
              .catch(() => false);
            if (tunnelHealthy !== true)
              return createAdapterVerification(plan, context, 'failed');
          }
        }
        const health = await this.controlPlane.connectivity.registry
          .get(active.providerId)
          .getHealth(active.id);
        const healthy = health.status !== 'unhealthy' && health.internetReachable !== false;
        return this.verifyDestinationOutcome(
          plan,
          context,
          createAdapterVerification(plan, context, healthy ? 'success' : 'failed'),
        );
      }

      if (plan.selectedAction.intent === 'route_change') {
        const destination = destinationFromPlan(plan, this.controlPlane.destination);
        const sources = this.controlPlane.connectivity.getAvailableSources();
        const decision = await this.controlPlane.routing.decide({
          destination,
          connectivitySources: sources,
        });
        const verification = await this.verifyDestinationOutcome(
          plan,
          context,
          createAdapterVerification(
            plan,
            context,
            decision.selected && decision.plan.selectedPath ? 'success' : 'failed',
          ),
        );
        if (verification.status === 'success') {
          // Only a change whose destination was verified is confirmed to the data plane.
          const applied = this.appliedRoutePlans.get(plan.selectedAction.id);
          if (applied) await this.controlPlane.routing.confirmPlan?.(applied);
        }
        return verification;
      }

      if (plan.selectedAction.intent === 'dns_switch') {
        const dns = this.controlPlane.dns;
        if (!dns) return createAdapterVerification(plan, context, 'failed');
        const activeId = dns.getActiveProviderId?.() ?? dns.engine.status().activeProviderId;
        if (!activeId) return createAdapterVerification(plan, context, 'failed');
        const active = dns.engine
          .status()
          .providers.find((item) => item.provider.id === activeId)?.provider;
        if (!active) return createAdapterVerification(plan, context, 'failed');
        const health = await active.health();
        const healthy =
          typeof health === 'object' &&
          health !== null &&
          'healthy' in health &&
          (health as { healthy?: unknown }).healthy === true;
        return this.verifyDestinationOutcome(
          plan,
          context,
          createAdapterVerification(plan, context, healthy ? 'success' : 'failed'),
        );
      }

      if (plan.selectedAction.intent === 'tunnel_switch') {
        if (!this.controlPlane.tunnel?.configured)
          return createAdapterVerification(plan, context, 'failed');
        const tunnelId =
          typeof execution.metadata.tunnelId === 'string' ? execution.metadata.tunnelId : undefined;
        if (!tunnelId) return createAdapterVerification(plan, context, 'failed');
        return this.verifyDestinationOutcome(
          plan,
          context,
          createAdapterVerification(
            plan,
            context,
            (await this.controlPlane.tunnel.verify(tunnelId)) ? 'success' : 'failed',
          ),
        );
      }

      return createAdapterVerification(plan, context, 'failed');
    } catch {
      return createAdapterVerification(plan, context, 'failed');
    }
  }

  async verifyRollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionVerification> {
    if (context.mode !== 'live') return createAdapterVerification(plan, context, 'success');
    if (plan.selectedAction.intent === 'route_change') {
      // A rollback is proven by the system's own state, not by the rollback call returning.
      const routePlan = this.rolledBackRoutePlans.get(plan.selectedAction.id);
      if (!routePlan) return createAdapterVerification(plan, context, 'failed');
      try {
        const proven = await this.controlPlane.routing.verifyRollback(routePlan);
        if (proven) this.rolledBackRoutePlans.delete(plan.selectedAction.id);
        return createAdapterVerification(plan, context, proven ? 'success' : 'failed');
      } catch {
        return createAdapterVerification(plan, context, 'failed');
      }
    }
    // Other intents keep their existing check: the post-mutation verification.
    return this.verify(plan, createAdapterExecution(plan, context, false, 'success'), context);
  }

  async rollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    if (context.mode !== 'live') return createAdapterExecution(plan, context, true);

    if (
      plan.selectedAction.intent === 'connectivity_failover' ||
      plan.selectedAction.intent === 'provider_switch'
    ) {
      try {
        const previousSourceId = plan.selectedAction.metadata.previousSourceId;
        if (typeof previousSourceId !== 'string')
          return createAdapterExecution(plan, context, false, 'failed');
        // The gateway transition owns the tunnel and the route as well as the source switch, so
        // the rollback has to revert all three.
        const applied = this.appliedGateways.get(plan.selectedAction.id);
        if (applied) {
          const gatewayRolledBack = await this.controlPlane.gatewaySelection?.rollback?.(
            applied.gatewayId,
          );
          if (gatewayRolledBack !== true)
            return createAdapterExecution(plan, context, false, 'failed');
          this.appliedGateways.delete(plan.selectedAction.id);
        }
        await this.controlPlane.connectivity.switchSource(previousSourceId);
        return createAdapterExecution(plan, context, false, 'success');
      } catch {
        return createAdapterExecution(plan, context, false, 'failed');
      }
    }

    if (plan.selectedAction.intent === 'dns_switch') {
      const dns = this.controlPlane.dns;
      if (!dns) return createAdapterExecution(plan, context, false, 'failed');
      const previousProviderId = this.previousDnsProviders.get(plan.selectedAction.id);
      if (!previousProviderId) return createAdapterExecution(plan, context, false, 'failed');
      const provider = dns.engine
        .status()
        .providers.find((item) => item.provider.id === previousProviderId)?.provider;
      if (!provider) return createAdapterExecution(plan, context, false, 'failed');
      try {
        await dns.applyProvider(provider);
        this.previousDnsProviders.delete(plan.selectedAction.id);
        return createAdapterExecution(plan, context, false, 'success');
      } catch {
        return createAdapterExecution(plan, context, false, 'failed');
      }
    }

    if (plan.selectedAction.intent === 'route_change') {
      const routePlan = this.appliedRoutePlans.get(plan.selectedAction.id);
      if (!routePlan) return createAdapterExecution(plan, context, false, 'failed');
      const rolledBack = await this.controlPlane.routing.rollbackPlan(routePlan);
      if (rolledBack) {
        this.appliedRoutePlans.delete(plan.selectedAction.id);
        this.rolledBackRoutePlans.set(plan.selectedAction.id, routePlan);
      }
      return createAdapterExecution(plan, context, false, rolledBack ? 'success' : 'failed');
    }

    if (plan.selectedAction.intent === 'tunnel_switch') {
      if (!this.controlPlane.tunnel?.configured)
        return createAdapterExecution(plan, context, false, 'failed');
      try {
        const rolledBack = await this.controlPlane.tunnel.rollback();
        return createAdapterExecution(plan, context, rolledBack, rolledBack ? 'success' : 'failed');
      } catch {
        return createAdapterExecution(plan, context, false, 'failed');
      }
    }

    return createAdapterExecution(plan, context, false, 'failed');
  }
}
