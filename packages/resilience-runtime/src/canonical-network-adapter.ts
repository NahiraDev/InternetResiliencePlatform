import {
  ConnectivityManager,
  type ConnectivitySource,
} from '@irp/connectivity';
import {
  RoutingEngine,
  parseDestination,
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
  readonly metadata: Record<string, unknown>;
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
      activeProviderId?: string;
      providers: CanonicalDnsProviderScore[];
    };
  };
  readonly applyProvider: (provider: CanonicalDnsProvider) => Promise<void>;
  readonly getActiveProviderId?: () => string | undefined;
}

export interface CanonicalTunnelControlPlane {
  readonly connect: (request?: { providerId?: string }) => Promise<{ tunnelId: string; providerId: string; connectionId: string }>;
  readonly verify: (tunnelId: string) => Promise<boolean>;
  readonly rollback: () => Promise<boolean>;
  readonly configured: boolean;
}

export interface CanonicalNetworkControlPlane {
  readonly connectivity: ConnectivityManager;
  readonly routing: RoutingEngine;
  readonly dns?: CanonicalDnsControlPlane;
  readonly tunnel?: CanonicalTunnelControlPlane;
  readonly destination?: RoutingDestination;
}

const destinationFromPlan = (plan: ActionPlan, fallback?: RoutingDestination): RoutingDestination => {
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

const dnsSelectionMetadata = (ranked: CanonicalDnsProviderScore[], selected: CanonicalDnsProvider | undefined) => ({
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

  async execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    if (context.mode !== 'live') return createAdapterExecution(plan, context, true);

    try {
      switch (plan.selectedAction.intent) {
        case 'connectivity_failover':
        case 'provider_switch': {
          await this.controlPlane.connectivity.discoverResources();
          const evaluation = await this.controlPlane.connectivity.selectSource();
          const selected = evaluation.selected?.source;
          if (!selected) return createAdapterExecution(plan, context, false, 'failed');
          const current = evaluation.current?.sourceId;
          if (selected.sourceId !== current) await this.controlPlane.connectivity.switchSource(selected.sourceId);
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
          const decision = await this.controlPlane.routing.decide({ destination, connectivitySources: sources });
          if (!decision.selected || !decision.plan.selectedPath) return createAdapterExecution(plan, context, false, 'failed');
          const applied = await this.controlPlane.routing.applyPlan(decision.plan);
          const success = applied.verification.status === 'succeeded';
          const execution = createAdapterExecution(plan, context, false, success ? 'success' : 'failed');
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
          const previousProviderId = dns.getActiveProviderId?.() ?? dns.engine.status().activeProviderId;
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
              transition: 'provider-selection-and-apply',
              previousProviderId,
              ...dnsSelectionMetadata(ranked, selected),
            },
          };
        }
        default:
          return createAdapterExecution(plan, context, false, 'failed');
      }
    } catch (error) {
      return createAdapterExecution(plan, context, false, 'failed', error instanceof Error ? error.message : String(error));
    }
  }

  async verify(plan: ActionPlan, context: RuntimeContext, execution: ActionExecution): Promise<ActionVerification> {
    if (context.mode !== 'live') return createAdapterVerification(plan, context, execution, true);

    try {
      switch (plan.selectedAction.intent) {
        case 'connectivity_failover':
        case 'provider_switch': {
          await this.controlPlane.connectivity.discoverResources();
          const evaluation = await this.controlPlane.connectivity.selectSource();
          const expected = (execution.metadata?.selectedSource as { sourceId?: string } | undefined)?.sourceId;
          const verified = Boolean(evaluation.selected?.source.sourceId && (!expected || evaluation.selected.source.sourceId === expected));
          return createAdapterVerification(plan, context, execution, verified, verified ? undefined : 'connectivity source verification failed');
        }
        case 'route_change': {
          const destination = destinationFromPlan(plan, this.controlPlane.destination);
          const sources = this.controlPlane.connectivity.getAvailableSources();
          const decision = await this.controlPlane.routing.decide({ destination, connectivitySources: sources });
          const expected = execution.metadata?.selectedRouteId;
          const verified = Boolean(decision.selected?.route.id && (!expected || decision.selected.route.id === expected));
          return createAdapterVerification(plan, context, execution, verified, verified ? undefined : 'route verification failed');
        }
        case 'dns_switch': {
          const dns = this.controlPlane.dns;
          const selectedProviderId = execution.metadata?.selectedProviderId;
          const activeProviderId = dns?.getActiveProviderId?.() ?? dns?.engine.status().activeProviderId;
          const verified = Boolean(dns && selectedProviderId && activeProviderId === selectedProviderId);
          return createAdapterVerification(plan, context, execution, verified, verified ? undefined : 'DNS provider verification failed');
        }
        default:
          return createAdapterVerification(plan, context, execution, false, 'unsupported canonical action');
      }
    } catch (error) {
      return createAdapterVerification(plan, context, execution, false, error instanceof Error ? error.message : String(error));
    }
  }

  async rollback(plan: ActionPlan, context: RuntimeContext, execution: ActionExecution): Promise<ActionVerification> {
    if (context.mode !== 'live') return createAdapterVerification(plan, context, execution, true);

    try {
      switch (plan.selectedAction.intent) {
        case 'connectivity_failover':
        case 'provider_switch': {
          const previousSourceId = (execution.metadata?.previousSourceId as string | undefined) ?? undefined;
          if (previousSourceId) await this.controlPlane.connectivity.switchSource(previousSourceId);
          return createAdapterVerification(plan, context, execution, true);
        }
        case 'route_change':
          await this.controlPlane.routing.rollback();
          return createAdapterVerification(plan, context, execution, true);
        case 'dns_switch': {
          const dns = this.controlPlane.dns;
          const previousProviderId = this.previousDnsProviders.get(plan.selectedAction.id);
          if (!dns || !previousProviderId) return createAdapterVerification(plan, context, execution, false, 'previous DNS provider is unavailable for rollback');
          const ranked = await dns.engine.evaluate();
          const previous = ranked.find((item) => item.provider.id === previousProviderId)?.provider;
          if (!previous) return createAdapterVerification(plan, context, execution, false, 'previous DNS provider is unavailable');
          await dns.applyProvider(previous);
          this.previousDnsProviders.delete(plan.selectedAction.id);
          return createAdapterVerification(plan, context, execution, true);
        }
        default:
          return createAdapterVerification(plan, context, execution, false, 'unsupported canonical rollback');
      }
    } catch (error) {
      return createAdapterVerification(plan, context, execution, false, error instanceof Error ? error.message : String(error));
    }
  }
}
