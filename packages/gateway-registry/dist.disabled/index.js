const lifecycleTransitions = {
    registered: ['active', 'disabled', 'retired'],
    active: ['draining', 'disabled', 'retired'],
    draining: ['active', 'disabled', 'retired'],
    disabled: ['active', 'retired'],
    retired: [],
};
const clone = (value) => structuredClone(value);
function assertGateway(gateway) {
    if (!gateway.id.trim())
        throw new Error('gateway id is required');
    if (!gateway.name.trim())
        throw new Error('gateway name is required');
    if (!gateway.ownership.ownerId.trim())
        throw new Error('gateway ownership ownerId is required');
    if (!Number.isInteger(gateway.endpoint.port) ||
        gateway.endpoint.port < 1 ||
        gateway.endpoint.port > 65535)
        throw new Error('gateway endpoint port must be an integer between 1 and 65535');
    if (gateway.endpoint.host.trim().length === 0)
        throw new Error('gateway endpoint host is required');
    if (gateway.tags.some((tag) => !tag.trim()))
        throw new Error('gateway tags must not be empty');
    if (new Set(gateway.tags).size !== gateway.tags.length)
        throw new Error('gateway tags must be unique');
    if (gateway.capabilities.addressFamilies.length === 0)
        throw new Error('gateway must declare address families');
    if (gateway.tunnel !== undefined)
        assertTunnelDeclaration(gateway.tunnel);
}
/**
 * Validates a tunnel declaration.
 *
 * A declaration without a protocol or without a credential reference is rejected: the gateway
 * plane must fail closed rather than invent a protocol or fall back to a placeholder credential.
 */
export function assertTunnelDeclaration(declaration) {
    if (!declaration.protocol.trim())
        throw new Error('gateway tunnel protocol is required');
    if (!declaration.credentialRef.trim())
        throw new Error('gateway tunnel credentialRef is required');
    if (declaration.routingMode !== 'fullTunnel' && declaration.routingMode !== 'splitTunnel')
        throw new Error('gateway tunnel routingMode must be fullTunnel or splitTunnel');
    if (declaration.addressCidr !== undefined && !/^[0-9.]+\/[0-9]+$|^[0-9a-fA-F:]+\/[0-9]+$/.test(declaration.addressCidr))
        throw new Error('gateway tunnel addressCidr must be a CIDR');
    const destinations = [
        ...(declaration.allowedDestinations ?? []),
        ...(declaration.excludedDestinations ?? []),
    ];
    if (destinations.some((value) => !value.trim()))
        throw new Error('gateway tunnel destinations must not be empty');
    if (declaration.mtu !== undefined && (!Number.isInteger(declaration.mtu) || declaration.mtu < 576))
        throw new Error('gateway tunnel mtu must be an integer of at least 576');
    if (declaration.keepaliveSeconds !== undefined &&
        (!Number.isInteger(declaration.keepaliveSeconds) ||
            declaration.keepaliveSeconds < 0 ||
            declaration.keepaliveSeconds > 65535))
        throw new Error('gateway tunnel keepaliveSeconds must be an integer between 0 and 65535');
}
export class InMemoryGatewayRegistry {
    gateways = new Map();
    register(input) {
        assertGateway(input);
        if (this.gateways.has(input.id))
            throw new Error(`gateway ${input.id} already exists`);
        const gateway = clone(input);
        this.gateways.set(gateway.id, gateway);
        return clone(gateway);
    }
    get(id) {
        const gateway = this.gateways.get(id);
        return gateway ? clone(gateway) : undefined;
    }
    list(filter = {}) {
        const matches = (value, expected) => expected === undefined ||
            (Array.isArray(expected) ? expected.includes(value) : value === expected);
        return [...this.gateways.values()]
            .filter((gateway) => matches(gateway.lifecycle, filter.lifecycle))
            .filter((gateway) => matches(gateway.trust, filter.trust))
            .filter((gateway) => filter.region === undefined || gateway.region === filter.region)
            .filter((gateway) => filter.countryCode === undefined || gateway.countryCode === filter.countryCode)
            .filter((gateway) => filter.providerId === undefined || gateway.providerId === filter.providerId)
            .filter((gateway) => filter.ownerId === undefined || gateway.ownership.ownerId === filter.ownerId)
            .filter((gateway) => filter.tag === undefined || gateway.tags.includes(filter.tag))
            .map(clone);
    }
    update(id, patch) {
        const current = this.require(id);
        const updated = {
            ...current,
            ...patch,
            endpoint: patch.endpoint ? { ...patch.endpoint } : current.endpoint,
            ownership: patch.ownership ? { ...patch.ownership } : current.ownership,
            capabilities: patch.capabilities ? { ...patch.capabilities } : current.capabilities,
            ...(patch.tunnel === undefined
                ? {}
                : { tunnel: { ...patch.tunnel } }),
            tags: patch.tags ? [...patch.tags] : [...current.tags],
            updatedAt: new Date().toISOString(),
        };
        assertGateway(updated);
        this.gateways.set(id, updated);
        return clone(updated);
    }
    transition(id, lifecycle) {
        const current = this.require(id);
        if (current.lifecycle === lifecycle)
            return clone(current);
        if (!lifecycleTransitions[current.lifecycle].includes(lifecycle))
            throw new Error(`invalid gateway lifecycle transition: ${current.lifecycle} -> ${lifecycle}`);
        const now = new Date().toISOString();
        const updated = lifecycle === 'retired'
            ? { ...current, lifecycle, updatedAt: now, retiredAt: now }
            : (() => {
                const { retiredAt: _retiredAt, ...activeMetadata } = current;
                return { ...activeMetadata, lifecycle, updatedAt: now };
            })();
        this.gateways.set(id, updated);
        return clone(updated);
    }
    setTrust(id, trust) {
        const current = this.require(id);
        if (current.trust === 'revoked' && trust !== 'revoked')
            throw new Error('revoked gateways require explicit re-registration');
        const updated = { ...current, trust, updatedAt: new Date().toISOString() };
        this.gateways.set(id, updated);
        return clone(updated);
    }
    remove(id) {
        const current = this.require(id);
        if (current.lifecycle !== 'retired')
            throw new Error('only retired gateways can be removed');
        this.gateways.delete(id);
        return clone(current);
    }
    require(id) {
        const gateway = this.gateways.get(id);
        if (!gateway)
            throw new Error(`gateway ${id} not found`);
        return gateway;
    }
}
export * from './health.js';
export * from './discovery.js';
export * from './selection.js';
export * from './failover.js';
export * from './fleet.js';
export * from './security.js';
export * from './starlink-resources.js';
export * from './probe.js';
export * from './capacity-contracts.js';
export * from './shared-infrastructure-adapter.js';
//# sourceMappingURL=index.js.map