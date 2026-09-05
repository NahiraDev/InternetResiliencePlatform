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
  readonly connect: (request?: { providerId?: string }) => Promise<{
    tunnelId: string;
    providerId: string;
    connectionId: string;
  }>;
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
        const health = await this.controlPlane.connectivity.registry
          .get(active.providerId)
          .getHealth(active.id);
        const healthy = health.status !== 'unhealthy' && health.internetReachable !== false;
        return createAdapterVerification(plan, context, healthy ? 'success' : 'failed');
      }

      if (plan.selectedAction.intent === 'route_change') {
        const destination = destinationFromPlan(plan, this.controlPlane.destination);
        const sources = this.controlPlane.connectivity.getAvailableSources();
        const decision = await this.controlPlane.routing.decide({
          destination,
          connectivitySources: sources,
        });
        return createAdapterVerification(
          plan,
          context,
          decision.selected && decision.plan.selectedPath ? 'success' : 'failed',
        );
      }

      if (plan.selectedAction.intent === 'dns_switch') {
        const dns = this.controlPlane.dns;
        if (!dns) return createAdapterVerification(plan, context, 'failed');
        const activeId = dns.getActiveProviderId?.() ?? dns.engine.status().activeProviderId;
        if (!activeId) return createAdapterVerification(plan, context, 'failed');
        const active = dns.engine.status().providers.find(
          (item) => item.provider.id === activeId,
        )?.provider;
        if (!active) return createAdapterVerification(plan, context, 'failed');
        const health = await active.health();
        const healthy =
          typeof health === 'object' &&
          health !== null &&
          'healthy' in health &&
          (health as { healthy?: unknown }).healthy === true;
        return createAdapterVerification(plan, context, healthy ? 'success' : 'failed');
      }

      if (plan.selectedAction.intent === 'tunnel_switch') {
        if (!this.controlPlane.tunnel?.configured)
          return createAdapterVerification(plan, context, 'failed');
        const tunnelId =
          typeof execution.metadata.tunnelId === 'string'
            ? execution.metadata.tunnelId
            : undefined;
        if (!tunnelId) return createAdapterVerification(plan, context, 'failed');
        return createAdapterVerification(
          plan,
          context,
          (await this.controlPlane.tunnel.verify(tunnelId)) ? 'success' : 'failed',
        );
      }

      return createAdapterVerification(plan, context, 'failed');
    } catch {
      return createAdapterVerification(plan, context, 'failed');
    }
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
      const provider = dns.engine.status().providers.find(
        (item) => item.provider.id === previousProviderId,
      )?.provider;
      if (!provider) return createAdapterExecution(plan, context, false, 'failed');
      try {
        await dns.applyProvider(provider);
        this.previousDnsProviders.delete(plan.selectedAction.id);
        return createAdapterExecution(plan, context, false, 'success');
      } catch {
        return createAdapterExecution(plan, context, false, 'failed');
      }
    }

    if (plan.selectedAction.intent === 'tunnel_switch' && this.controlPlane.tunnel) {
      try {
        return createAdapterExecution(
          plan,
          context,
          false,
          (await this.controlPlane.tunnel.rollback()) ? 'success' : 'failed',
        );
      } catch {
        return createAdapterExecution(plan, context, false, 'failed');
      }
    }

    return createAdapterExecution(plan, context, false, 'failed');
  }
}

export class CanonicalTunnelRuntimeAdapter implements RuntimeAdapter {
  readonly descriptor: RuntimeAdapterDescriptor = {
    adapterId: 'canonical-tunnel-control-plane',
    subsystem: 'tunnel',
    version: '1.0.0',
    capabilities: ['tunnel.write'],
    supportedActions: ['tunnel_switch'],
    supportsSimulation: true,
    supportsSafe: true,
    supportsLive: true,
    requiredPermissions: ['network-control'],
    requiredKernelCapabilities: ['NET_ADMIN'],
    verificationSupport: true,
    recoverySupport: true,
  };

  constructor(private readonly controlPlane: CanonicalTunnelControlPlane) {}

  async execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    if (context.mode !== 'live') return createAdapterExecution(plan, context, true);
    if (!this.controlPlane.configured)
      return createAdapterExecution(plan, context, false, 'failed');
    try {
      const providerId = providerIdFromPlan(plan);
      const result = await this.controlPlane.connect(
        providerId ? { providerId } : undefined,
      );
      return {
        ...createAdapterExecution(plan, context, false, 'success'),
        metadata: {
          controlPlane: 'tunnel',
          tunnelId: result.tunnelId,
          connectionId: result.connectionId,
          providerId: result.providerId,
        },
      };
    } catch (error) {
      return {
        ...createAdapterExecution(plan, context, false, 'failed'),
        error: error instanceof Error ? error.message : 'tunnel operation failed',
      };
    }
  }

  async verify(
    plan: ActionPlan,
    execution: ActionExecution,
    context: RuntimeContext,
  ): Promise<ActionVerification> {
    if (context.mode !== 'live') return createAdapterVerification(plan, context, 'success');
    if (!this.controlPlane.configured || execution.status !== 'success')
      return createAdapterVerification(plan, context, 'failed');
    const tunnelId =
      typeof execution.metadata.tunnelId === 'string'
        ? execution.metadata.tunnelId
        : undefined;
    if (!tunnelId) return createAdapterVerification(plan, context, 'failed');
    try {
      return createAdapterVerification(
        plan,
        context,
        (await this.controlPlane.verify(tunnelId)) ? 'success' : 'failed',
      );
    } catch {
      return createAdapterVerification(plan, context, 'failed');
    }
  }

  async rollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    if (context.mode !== 'live') return createAdapterExecution(plan, context, true);
    try {
      return createAdapterExecution(
        plan,
        context,
        false,
        (await this.controlPlane.rollback()) ? 'success' : 'failed',
      );
    } catch {
      return createAdapterExecution(plan, context, false, 'failed');
    }
  }
}
