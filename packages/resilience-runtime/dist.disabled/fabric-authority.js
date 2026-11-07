/**
 * Unified fabric capability registry with enforceable scope, authority, trust,
 * safety and platform compatibility (issue #275, task 5).
 *
 * The registry is the single place that answers "may this actor use this
 * capability, for this resource, on this platform, at this trust level?".
 * Selection paths must consult it rather than trusting resource-local claims.
 */
const SAFETY_ORDER = Object.freeze({
    'read-only': 0,
    safe: 1,
    governed: 2,
});
const AUTHORITY_ORDER = Object.freeze({
    external: 0,
    provider: 1,
    adapter: 2,
    runtime: 3,
});
const platformMatches = (declared, platform) => {
    if (!platform || platform === 'any')
        return true;
    return declared.some((entry) => entry === platform || entry === 'any');
};
/**
 * Enforceable registry. `authorize` is the only supported way to decide whether
 * a capability may be used; resource-local capability claims are evidence, not
 * authorization.
 */
export class FabricCapabilityAuthority {
    capabilities = new Map();
    register(capability) {
        if (!capability.id.trim())
            throw new Error('fabric capability id is required');
        if (!capability.scope.trim())
            throw new Error(`fabric capability ${capability.id} requires scope`);
        if (!Number.isFinite(capability.trust) || capability.trust < 0 || capability.trust > 1) {
            throw new Error(`fabric capability ${capability.id} trust must be between 0 and 1`);
        }
        if (this.capabilities.has(capability.id)) {
            throw new Error(`fabric capability already registered: ${capability.id}`);
        }
        const scopeCollision = [...this.capabilities.values()].find((existing) => existing.scope === capability.scope && existing.id !== capability.id);
        if (scopeCollision) {
            throw new Error(`fabric capability scope ${capability.scope} is already claimed by ${scopeCollision.id}`);
        }
        this.capabilities.set(capability.id, Object.freeze({ ...capability }));
    }
    get(id) {
        return this.capabilities.get(id);
    }
    list() {
        return Object.freeze([...this.capabilities.values()]);
    }
    listByScope(scope) {
        return Object.freeze([...this.capabilities.values()].filter((capability) => capability.scope === scope));
    }
    /** Resolves the single authoritative decision for a capability request. */
    authorize(request) {
        const reasons = [];
        const capability = this.capabilities.get(request.capabilityId);
        if (!capability) {
            return Object.freeze({
                allowed: false,
                reasons: Object.freeze([`capability-not-registered:${request.capabilityId}`]),
            });
        }
        if (!platformMatches(capability.platforms, request.platform)) {
            reasons.push(`platform-unsupported:${request.platform ?? 'any'}`);
        }
        // Declared scope is binding: without this a capability registered for
        // `gateway` would authorize a request against any resource at all.
        if (request.scope !== undefined && capability.scope !== request.scope) {
            reasons.push(`scope-mismatch:${capability.scope}!=${request.scope}`);
        }
        if (request.minimumTrust !== undefined && capability.trust < request.minimumTrust) {
            reasons.push(`insufficient-trust:${capability.trust}<${request.minimumTrust}`);
        }
        if (request.maximumSafety !== undefined &&
            SAFETY_ORDER[capability.safety] > SAFETY_ORDER[request.maximumSafety]) {
            reasons.push(`safety-exceeds-ceiling:${capability.safety}`);
        }
        if (request.requireRuntimeAuthority && capability.authority !== 'runtime') {
            reasons.push(`authority-insufficient:${capability.authority}`);
        }
        return Object.freeze({
            allowed: reasons.length === 0,
            capability,
            reasons: Object.freeze(reasons),
        });
    }
    /** Authorizes a set of capabilities, returning only the first failure. */
    authorizeAll(requests) {
        const denied = requests
            .map((request) => this.authorize(request))
            .filter((decision) => !decision.allowed);
        if (denied.length === 0) {
            const [first] = requests.map((request) => this.authorize(request));
            return Object.freeze({
                allowed: true,
                ...(first?.capability ? { capability: first.capability } : {}),
                reasons: Object.freeze([]),
            });
        }
        const [firstDenied] = denied;
        return Object.freeze({
            allowed: false,
            ...(firstDenied?.capability ? { capability: firstDenied.capability } : {}),
            reasons: firstDenied?.reasons ?? Object.freeze(['capability-denied']),
        });
    }
    /** Highest authority declared for a capability, used for precedence. */
    authorityRank(id) {
        const capability = this.capabilities.get(id);
        return capability ? AUTHORITY_ORDER[capability.authority] : -1;
    }
}
//# sourceMappingURL=fabric-authority.js.map