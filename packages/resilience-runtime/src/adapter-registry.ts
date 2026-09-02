import type {
  ActionExecution,
  ActionIntent,
  ActionPlan,
  ActionVerification,
  RuntimeContext,
} from './domain/types.js';
import { deepFreeze, nextId, nowIso } from './domain/ids.js';
import { CanonicalNetworkRuntimeAdapter, type CanonicalNetworkControlPlane } from './canonical-network-adapter.js';
export type RuntimeSubsystem =
  | 'network-intelligence'
  | 'connectivity'
  | 'dns'
  | 'routing'
  | 'tunnel'
  | 'failover'
  | 'kernel'
  | 'plugin';
export interface RuntimeAdapterDescriptor {
  adapterId: string;
  subsystem: RuntimeSubsystem;
  version: string;
  capabilities: readonly string[];
  supportedActions: readonly ActionIntent[];
  supportsSimulation: boolean;
  supportsSafe: boolean;
  supportsLive: boolean;
  requiredPermissions: readonly string[];
  requiredKernelCapabilities: readonly string[];
  verificationSupport: boolean;
  recoverySupport: boolean;
}
export interface RuntimeAdapter {
  readonly descriptor: RuntimeAdapterDescriptor;
  execute(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
  verify(
    plan: ActionPlan,
    execution: ActionExecution,
    context: RuntimeContext,
  ): Promise<ActionVerification>;
  rollback?(plan: ActionPlan, context: RuntimeContext): Promise<ActionExecution>;
}
export class RuntimeAdapterRegistry {
  private readonly adapters = new Map<string, RuntimeAdapter>();
  register(adapter: RuntimeAdapter) {
    for (const cap of adapter.descriptor.capabilities)
      if (!cap) throw new Error('Adapter capability must be explicit');
    this.adapters.set(adapter.descriptor.adapterId, adapter);
  }
  list() {
    return [...this.adapters.values()].map((a) => a.descriptor);
  }
  findForAction(action: ActionIntent, capabilities: readonly string[]) {
    return [...this.adapters.values()].find(
      (a) =>
        a.descriptor.supportedActions.includes(action) &&
        capabilities.every((c) => a.descriptor.capabilities.includes(c)),
    );
  }
  requireCapability(capability: string) {
    if (!this.list().some((d) => d.capabilities.includes(capability)))
      throw new Error(`Unknown runtime capability: ${capability}`);
  }
}
export const createAdapterExecution = (
  plan: ActionPlan,
  context: RuntimeContext,
  simulated: boolean,
  status: ActionExecution['status'] = 'success',
): ActionExecution =>
  deepFreeze({
    id: nextId('exec'),
    schemaVersion: 1,
    createdAt: nowIso(),
    correlationId: context.correlationId,
    source: 'runtime-adapter-registry',
    metadata: { adapter: true },
    status,
    simulated,
    actionId: plan.selectedAction.id,
    beforeState: { mode: context.mode },
    afterState: { intent: plan.selectedAction.intent },
  });
export const createAdapterVerification = (
  plan: ActionPlan,
  context: RuntimeContext,
  status: ActionVerification['status'] = 'success',
): ActionVerification =>
  deepFreeze({
    id: nextId('verify'),
    schemaVersion: 1,
    createdAt: nowIso(),
    correlationId: context.correlationId,
    source: 'runtime-adapter-registry',
    metadata: { adapter: true },
    status,
    verifiedPostconditions: status === 'success' ? plan.expectedPostconditions : [],
    failedPostconditions: status === 'success' ? [] : plan.expectedPostconditions,
  });
export class DeterministicRuntimeAdapter implements RuntimeAdapter {
  constructor(
    readonly descriptor: RuntimeAdapterDescriptor,
    private readonly verificationStatus: ActionVerification['status'] = 'success',
  ) {}
  async execute(plan: ActionPlan, context: RuntimeContext) {
    return createAdapterExecution(plan, context, context.mode !== 'live');
  }
  async verify(plan: ActionPlan, _execution: ActionExecution, context: RuntimeContext) {
    return createAdapterVerification(plan, context, this.verificationStatus);
  }
  async rollback(plan: ActionPlan, context: RuntimeContext) {
    if (!this.descriptor.recoverySupport) {
      return createAdapterExecution(plan, context, context.mode !== 'live', 'failed');
    }
    return createAdapterExecution(plan, context, context.mode !== 'live', 'success');
  }
}
export const createDefaultRuntimeAdapterRegistry = (
  networkControlPlane?: CanonicalNetworkControlPlane,
) => {
  const r = new RuntimeAdapterRegistry();
  const defs: RuntimeAdapterDescriptor[] = [
    ['network-intelligence', 'network-intelligence', ['network.observe'], ['health_reprobe']],
    ['connectivity', 'connectivity', ['connectivity.failover'], ['connectivity_failover']],
    ['dns', 'dns', ['dns_plain', 'dns_doh', 'dns_dot', 'dns.write'], ['dns_switch']],
    ['routing', 'routing', ['route.write'], ['route_change']],
    ['tunnel', 'tunnel', ['tunnel.write'], ['tunnel_switch']],
    ['failover', 'failover', ['recovery.execute'], ['recovery', 'rollback']],
    ['kernel', 'kernel', ['kernel.route'], ['route_change']],
    ['plugin', 'plugin', ['plugin.action'], ['provider_switch']],
  ].map(([adapterId, subsystem, capabilities, supportedActions]) => ({
    adapterId: String(adapterId),
    subsystem: subsystem as RuntimeSubsystem,
    version: '1.0.0',
    capabilities: capabilities as string[],
    supportedActions: supportedActions as ActionIntent[],
    supportsSimulation: true,
    supportsSafe: true,
    supportsLive: false,
    requiredPermissions: [],
    requiredKernelCapabilities: subsystem === 'kernel' ? ['NET_ADMIN'] : [],
    verificationSupport: true,
    recoverySupport: subsystem === 'failover',
  }));
  for (const d of defs) r.register(new DeterministicRuntimeAdapter(d));
  if (networkControlPlane) r.register(new CanonicalNetworkRuntimeAdapter(networkControlPlane));
  return r;
};
