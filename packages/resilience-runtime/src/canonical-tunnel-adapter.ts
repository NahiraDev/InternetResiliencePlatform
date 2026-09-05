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
import type { CanonicalTunnelControlPlane } from './canonical-network-adapter.js';

const providerIdFromPlan = (plan: ActionPlan): string | undefined => {
  const metadata = plan.selectedAction.metadata as Record<string, unknown>;
  return typeof metadata.providerId === 'string' ? metadata.providerId : undefined;
};

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
