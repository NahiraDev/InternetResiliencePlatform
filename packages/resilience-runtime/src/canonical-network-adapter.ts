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

export interface CanonicalNetworkControlPlane {
  readonly connectivity: ConnectivityManager;
  readonly routing: RoutingEngine;
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

export class CanonicalNetworkRuntimeAdapter implements RuntimeAdapter {
  readonly descriptor: RuntimeAdapterDescriptor = {
    adapterId: 'canonical-network-control-plane',
    subsystem: 'connectivity',
    version: '1.0.0',
    capabilities: [
      'connectivity.failover',
      'route.write',
      'network.observe',
    ],
    supportedActions: ['connectivity_failover', 'provider_switch', 'route_change'],
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
          if (selected.sourceId !== current) {
            await this.controlPlane.connectivity.switchSource(selected.sourceId);
          }

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
          if (!decision.selected || !decision.plan.selectedPath) {
            return createAdapterExecution(plan, context, false, 'failed');
          }
          const applied = await this.controlPlane.routing.applyPlan(decision.plan);
          const success = applied.verification.status === 'success';
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
    _execution: ActionExecution,
    context: RuntimeContext,
  ): Promise<ActionVerification> {
    if (context.mode !== 'live') return createAdapterVerification(plan, context, 'success');

    try {
      if (plan.selectedAction.intent === 'connectivity_failover' || plan.selectedAction.intent === 'provider_switch') {
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

      return createAdapterVerification(plan, context, 'failed');
    } catch {
      return createAdapterVerification(plan, context, 'failed');
    }
  }

  async rollback(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution> {
    if (context.mode !== 'live') return createAdapterExecution(plan, context, true);
    if (plan.selectedAction.intent !== 'connectivity_failover' && plan.selectedAction.intent !== 'provider_switch') {
      return createAdapterExecution(plan, context, false, 'failed');
    }

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
}
