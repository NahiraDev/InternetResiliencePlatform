/**
 * Adapts externally managed Starlink egress gateways into the normal
 * ConnectivityProvider/ConnectivityManager pipeline.
 *
 * The adapter deliberately does not contain credentials, public endpoints,
 * or provider-specific configuration. Operators supply a reachable gateway
 * endpoint through their own configuration/secret management and implement
 * the probe/activation boundary appropriate to their tunnel runtime.
 */
export class ExternalStarlinkGatewayProvider {
    id = 'starlink-external-gateways';
    type = 'custom';
    profiles;
    probeGateway;
    constructor(profiles, probeGateway) {
        this.validateProfiles(profiles);
        this.profiles = profiles.map((profile) => ({
            ...profile,
            tags: profile.tags ? [...profile.tags] : [],
            metadata: profile.metadata ? { ...profile.metadata } : {},
        }));
        this.probeGateway = probeGateway;
    }
    capabilities() {
        return [
            'connect',
            'disconnect',
            'activate',
            'deactivate',
            'monitor',
            'health-check',
            'supports-ipv4',
            'supports-ipv6',
            'supports-default-route',
            'supports-dns',
            'supports-tunneling',
        ];
    }
    async discover() {
        const resources = [];
        for (const profile of this.profiles) {
            if (profile.enabled === false)
                continue;
            const health = await this.probeGateway.probe(profile);
            resources.push(this.toResource(profile, health));
        }
        return resources;
    }
    async getState(resourceId) {
        const profile = this.requireProfile(resourceId);
        const health = await this.probeGateway.probe(profile);
        return health.status === 'healthy'
            ? 'active'
            : health.status === 'degraded'
                ? 'degraded'
                : 'failed';
    }
    async getHealth(resourceId) {
        return this.probeGateway.probe(this.requireProfile(resourceId));
    }
    async connect(resourceId) {
        const profile = this.requireProfile(resourceId);
        const health = await this.probeGateway.probe(profile);
        return health.status === 'unhealthy'
            ? { ok: false, resourceId, state: 'failed', error: 'Starlink gateway health check failed' }
            : {
                ok: true,
                resourceId,
                state: health.status === 'healthy' ? 'active' : 'degraded',
                metadata: { operation: 'verify-external-gateway' },
            };
    }
    async disconnect(resourceId) {
        this.requireProfile(resourceId);
        return {
            ok: false,
            resourceId,
            state: 'active',
            error: 'External Starlink gateway lifecycle is managed by its tunnel runtime',
        };
    }
    async activate(resourceId) {
        return this.connect(resourceId);
    }
    async deactivate(resourceId) {
        return this.disconnect(resourceId);
    }
    toResource(profile, health) {
        return {
            providerId: this.id,
            id: profile.id,
            type: this.type,
            state: health.status === 'healthy'
                ? 'active'
                : health.status === 'degraded'
                    ? 'degraded'
                    : 'unavailable',
            addresses: [],
            dnsServers: [],
            capabilities: this.capabilities(),
            health,
            priority: profile.priority ?? 45,
            metadata: {
                starlink: true,
                externalGateway: true,
                source: profile.source,
                protocol: profile.protocol,
                endpointConfigured: true,
                ...profile.metadata,
                tags: [...(profile.tags ?? [])],
            },
        };
    }
    requireProfile(resourceId) {
        if (!resourceId)
            throw new Error('Starlink gateway resourceId is required');
        const profile = this.profiles.find((candidate) => candidate.id === resourceId && candidate.enabled !== false);
        if (!profile)
            throw new Error(`Unknown Starlink gateway resource: ${resourceId}`);
        return profile;
    }
    validateProfiles(profiles) {
        const ids = new Set();
        for (const profile of profiles) {
            if (!profile.id.trim())
                throw new Error('Starlink gateway id is required');
            if (ids.has(profile.id))
                throw new Error(`Duplicate Starlink gateway id: ${profile.id}`);
            ids.add(profile.id);
            if (!profile.name.trim())
                throw new Error(`Starlink gateway ${profile.id} name is required`);
            if (!profile.endpoint.trim())
                throw new Error(`Starlink gateway ${profile.id} endpoint is required`);
            if (profile.priority !== undefined &&
                (!Number.isInteger(profile.priority) || profile.priority < 0)) {
                throw new Error(`Starlink gateway ${profile.id} priority must be a non-negative integer`);
            }
        }
    }
}
export function createStarlinkGatewayHealthProbe(probe) {
    return { probe };
}
//# sourceMappingURL=starlink-gateway.js.map