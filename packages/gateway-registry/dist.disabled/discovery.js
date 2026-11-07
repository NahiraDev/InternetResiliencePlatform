export class GatewayDiscovery {
    registry;
    options;
    constructor(registry, options) {
        this.registry = registry;
        this.options = options;
        if (!Number.isFinite(options.staleAfterMs) || options.staleAfterMs <= 0) {
            throw new Error('staleAfterMs must be positive');
        }
    }
    async refresh(source) {
        const gateways = await source.discover();
        const result = {
            discovered: gateways.length,
            registered: 0,
            updated: 0,
            stale: 0,
            rejected: 0,
            errors: [],
        };
        const now = this.options.now?.() ?? Date.now();
        const seen = new Set();
        for (const gateway of gateways) {
            seen.add(gateway.id);
            try {
                const existing = this.registry.get(gateway.id);
                if (!existing) {
                    this.registry.register(gateway);
                    result.registered += 1;
                    continue;
                }
                if (existing.lifecycle === 'retired') {
                    result.rejected += 1;
                    result.errors.push({
                        gatewayId: gateway.id,
                        reason: 'retired gateway cannot be rediscovered',
                    });
                    continue;
                }
                this.registry.update(gateway.id, {
                    name: gateway.name,
                    ...(gateway.description === undefined ? {} : { description: gateway.description }),
                    ...(gateway.region === undefined ? {} : { region: gateway.region }),
                    ...(gateway.countryCode === undefined ? {} : { countryCode: gateway.countryCode }),
                    ...(gateway.providerId === undefined ? {} : { providerId: gateway.providerId }),
                    endpoint: gateway.endpoint,
                    ownership: gateway.ownership,
                    capabilities: gateway.capabilities,
                    tags: gateway.tags,
                });
                result.updated += 1;
            }
            catch (error) {
                result.rejected += 1;
                result.errors.push({
                    gatewayId: gateway.id,
                    reason: error instanceof Error ? error.message : String(error),
                });
            }
        }
        for (const gateway of this.registry.list()) {
            if (seen.has(gateway.id) || gateway.lifecycle === 'retired')
                continue;
            const updatedAt = Date.parse(gateway.updatedAt);
            if (Number.isFinite(updatedAt) && now - updatedAt > this.options.staleAfterMs)
                result.stale += 1;
        }
        return result;
    }
}
//# sourceMappingURL=discovery.js.map