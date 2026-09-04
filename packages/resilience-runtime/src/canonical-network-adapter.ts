import {
  ConnectivityManager,
  type ConnectivitySource,
} from '@irp/connectivity';
import {
  IntelligentDnsEngine,
  type DnsProvider,
  type ProviderScore,
} from '@irp/dns';
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

export interface CanonicalDnsControlPlane {
  readonly engine: IntelligentDnsEngine;
  readonly applyProvider: (provider: DnsProvider) => Promise<void>;
  readonly getActiveProviderId?: () => string | undefined;
}

export interface CanonicalNetworkControlPlane {
  readonly connectivity: ConnectivityManager;
  readonly routing: RoutingEngine;
  readonly dns?: CanonicalDnsControlPlane;
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

const dnsSelectionMetadata = (ranked: ProviderScore[], selected: DnsProvider | undefined) => ({
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
  readonly descriptor: RuntimeAdapterDescriptor = {
    adapterId: 'canonical-network-control-plane',
    subsystem: 'connectivity',
    version: '1.1.0',
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

  async verify(plan: ActionPlan, _execution: ActionExecution, context: RuntimeContext): Promise<ActionVerification> {
    if (context.mode !== 'live') return createAdapterVerification(plan, context, 'success');

    try {
      if (plan.selectedAction.intent === 'connectivity_failover' || plan.selectedAction.intent === 'provider_switch') {
        const active = this.controlPlane.connectivity.getActiveSource();
        if (!active) return createAdapterVerification(plan, context, 'failed');
        const health = await this.controlPlane.connectivity.registry.get(active.providerId).getHealth(active.id);
        const healthy = health.status !== 'unhealthy' && health.internetReachable !== false;
        return createAdapterVerification(plan, context, healthy ? 'success' : 'failed');
      }

      if (plan.selectedAction.intent === 'route_change') {
        const destination = destinationFromPlan(plan, this.controlPlane.destination);
        const sources = this.controlPlane.connectivity.getAvailableSources();
        const decision = await this.controlPlane.routing.decide({ destination, connectivitySources: sources });
        return createAdapterVerification(plan, context, decision.selected && decision.plan.selectedPath ? 'success' : 'failed');
      }

      if (plan.selectedAction.intent === 'dns_switch') {
        const dns = this.controlPlane.dns;
        if (!dns) return createAdapterVerification(plan, context, 'failed');
        const activeId = dns.getActiveProviderId?.() ?? dns.engine.status().activeProviderId;
        if (!activeId) return createAdapterVerification(plan, context, 'failed');
        const active = dns.engine.status().providers.find((item) => item.provider.id === activeId)?.provider;
        if (!active) return createAdapterVerification(plan, context, 'failed');
        const health = await active.health();
        return createAdapterVerification(plan, context, health.healthy ? 'success' : 'failed');
      }

      return createAdapterVerification(plan, context, 'failed');
    } catch {
      return createAdapterVerification(plan, context, 'failed');
    }
  }

  async rollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    if (context.mode !== 'live') return createAdapterExecution(plan, context, true);

    if (plan.selectedAction.intent === 'connectivity_failover' || plan.selectedAction.intent === 'provider_switch') {
      try {
        await this.controlPlane.connectivity.discoverResources();
        const preferred = this.controlPlane.connectivity.getHealthySources()[0];
        if (!preferred) return createAdapterExecution(plan, context, false, 'failed');
        await this.controlPlane.connectivity.switchSource(preferred.sourceId);
        return createAdapterExecution(plan, context, false, 'success');
      } catch {
        return createAdapterExecution(plan, context, false, 'failed');
      }
    }

    if (plan.selectedAction.intent === 'dns_switch') {
      const dns = this.controlPlane.dns;
      if (!dns) return createAdapterExecution(plan, context, false, 'failed');
      const metadata = plan.selectedAction.metadata as Record<string, unknown>;
      const previousProviderId = typeof metadata.previousProviderId === 'string' ? metadata.previousProviderId : undefined;
      if (!previousProviderId) return createAdapterExecution(plan, context, false, 'failed');
      const provider = dns.engine.status().providers.find((item) => item.provider.id === previousProviderId)?.provider;
      if (!provider) return createAdapterExecution(plan, context, false, 'failed');
      try {
        await dns.applyProvider(provider);
        return createAdapterExecution(plan, context, false, 'success');
      } catch {
        return createAdapterExecution(plan, context, false, 'failed');
      }
    }

    return createAdapterExecution(plan, context, false, 'failed');
  }
}
