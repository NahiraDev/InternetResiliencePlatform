import { deepFreeze, nextId, nowIso } from './domain/ids.js';
import { CanonicalNetworkRuntimeAdapter, } from './canonical-network-adapter.js';
import { CanonicalTunnelRuntimeAdapter } from './canonical-tunnel-adapter.js';
export class RuntimeAdapterRegistry {
    adapters = new Map();
    register(adapter) {
        for (const cap of adapter.descriptor.capabilities)
            if (!cap)
                throw new Error('Adapter capability must be explicit');
        this.adapters.set(adapter.descriptor.adapterId, adapter);
    }
    list() {
        return [...this.adapters.values()].map((a) => a.descriptor);
    }
    findForAction(action, capabilities) {
        return [...this.adapters.values()].find((a) => a.descriptor.supportedActions.includes(action) &&
            capabilities.every((c) => a.descriptor.capabilities.includes(c)));
    }
    requireCapability(capability) {
        if (!this.list().some((d) => d.capabilities.includes(capability)))
            throw new Error(`Unknown runtime capability: ${capability}`);
    }
}
export const createAdapterExecution = (plan, context, simulated, status = 'success') => deepFreeze({
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
export const createAdapterVerification = (plan, context, status = 'success') => deepFreeze({
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
export class DeterministicRuntimeAdapter {
    descriptor;
    verificationStatus;
    constructor(descriptor, verificationStatus = 'success') {
        this.descriptor = descriptor;
        this.verificationStatus = verificationStatus;
    }
    async execute(plan, context) {
        return createAdapterExecution(plan, context, context.mode !== 'live');
    }
    async verify(plan, _execution, context) {
        return createAdapterVerification(plan, context, this.verificationStatus);
    }
    async rollback(plan, context) {
        if (!this.descriptor.recoverySupport) {
            return createAdapterExecution(plan, context, context.mode !== 'live', 'failed');
        }
        return createAdapterExecution(plan, context, context.mode !== 'live', 'success');
    }
}
export const createDefaultRuntimeAdapterRegistry = (networkControlPlane) => {
    const r = new RuntimeAdapterRegistry();
    const defs = [
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
        subsystem: subsystem,
        version: '1.0.0',
        capabilities: capabilities,
        supportedActions: supportedActions,
        supportsSimulation: true,
        supportsSafe: true,
        supportsLive: false,
        requiredPermissions: [],
        requiredKernelCapabilities: subsystem === 'kernel' ? ['NET_ADMIN'] : [],
        verificationSupport: true,
        recoverySupport: subsystem === 'failover',
    }));
    // `findForAction` returns the first registered match, so the canonical adapters must be
    // registered BEFORE the deterministic placeholders. Registered after them, the placeholder for
    // the same action (supportsLive: false) always won, and every live route/failover/DNS action was
    // rejected at validation with "adapter ... does not support live execution" without ever
    // reaching the kernel executor.
    if (networkControlPlane)
        r.register(new CanonicalNetworkRuntimeAdapter(networkControlPlane));
    if (networkControlPlane?.tunnel)
        r.register(new CanonicalTunnelRuntimeAdapter(networkControlPlane.tunnel));
    for (const d of defs)
        r.register(new DeterministicRuntimeAdapter(d));
    return r;
};
//# sourceMappingURL=adapter-registry.js.map