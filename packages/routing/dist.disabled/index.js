import { performance } from 'node:perf_hooks';
import { createId } from '@irp/shared';
/** Read-only graph projection used by routing decisions; it has no mutation authority. */
export class NetworkPathGraph {
    nodes;
    edges;
    entries;
    constructor(paths, destination) {
        const entries = paths.map((path) => ({ path, evidence: pathEvidence(path) }));
        const nodes = new Map();
        const edges = [];
        const addNode = (node) => nodes.set(node.id, node);
        const addEdge = (from, to, kind) => edges.push({ from, to, kind });
        for (const { path } of entries) {
            const pathId = `path:${path.id}`;
            addNode({ id: pathId, kind: 'path', state: path.state, metadata: path.metadata });
            addNode({
                id: `route:${path.route.id}`,
                kind: 'route',
                state: path.route.state,
                metadata: path.route.metadata,
            });
            addEdge(pathId, `route:${path.route.id}`, 'routes_through');
            if (path.route.interfaceName) {
                addNode({
                    id: `interface:${path.route.interfaceName}`,
                    kind: 'interface',
                    state: path.state,
                    metadata: {},
                });
                addEdge(`route:${path.route.id}`, `interface:${path.route.interfaceName}`, 'connected_to');
            }
            if (path.route.gateway) {
                addNode({
                    id: `gateway:${path.route.gateway}`,
                    kind: 'gateway',
                    state: path.state,
                    metadata: {},
                });
                addEdge(`route:${path.route.id}`, `gateway:${path.route.gateway}`, 'uses_gateway');
            }
            const provider = path.source?.providerId ?? path.provider?.split(':')[0];
            if (provider) {
                addNode({ id: `provider:${provider}`, kind: 'provider', state: path.state, metadata: {} });
                addEdge(`route:${path.route.id}`, `provider:${provider}`, 'uses_provider');
            }
            const transport = path.metadata.transport;
            if (typeof transport === 'string') {
                addNode({
                    id: `transport:${transport}`,
                    kind: 'transport',
                    state: path.state,
                    metadata: {},
                });
                addEdge(pathId, `transport:${transport}`, 'uses_transport');
            }
            if (destination) {
                const destinationId = `destination:${destination.kind}:${destination.value}`;
                addNode({
                    id: destinationId,
                    kind: 'destination',
                    state: path.state,
                    metadata: destination.metadata ?? {},
                });
                addEdge(pathId, destinationId, 'reaches');
            }
        }
        this.entries = entries;
        this.nodes = [...nodes.values()];
        this.edges = edges;
    }
    pathsFor(destination) {
        return (destination
            ? this.entries.filter(({ path }) => routeMatchesDestination(path.route, destination))
            : this.entries).map(({ path }) => path);
    }
    usablePaths(destination) {
        return this.pathsFor(destination).filter((path) => !['failed', 'disabled', 'expired'].includes(path.state));
    }
    independentAlternatives(pathId, destination) {
        const selected = this.entries.find(({ path }) => path.id === pathId);
        if (!selected)
            return [];
        const domains = new Set(selected.evidence.failureDomains);
        const usable = new Set(this.usablePaths(destination));
        return this.entries
            .filter(({ path, evidence }) => path.id !== pathId &&
            usable.has(path) &&
            evidence.failureDomains.some((domain) => !domains.has(domain)))
            .map(({ path }) => path);
    }
}
export const pathFailureDomains = (path) => {
    const declared = path.route.metadata.failureDomains;
    if (Array.isArray(declared)) {
        const values = declared.filter((value) => typeof value === 'string' && value.length > 0);
        if (values.length)
            return values;
    }
    const inferred = [
        path.source?.providerId ?? path.provider?.split(':')[0],
        path.route.gateway,
    ].filter((value) => typeof value === 'string' && value.length > 0);
    return inferred.length ? inferred : ['unknown'];
};
const pathEvidence = (path) => ({
    ...(path.health?.latencyMs === undefined ? {} : { latencyMs: path.health.latencyMs }),
    ...(path.health?.jitterMs === undefined ? {} : { jitterMs: path.health.jitterMs }),
    ...(path.health?.packetLoss === undefined ? {} : { packetLoss: path.health.packetLoss }),
    ...(path.health?.score === undefined
        ? {}
        : { availability: path.health.score / 100, reliability: path.health.score / 100 }),
    ...(typeof path.metadata.confidence === 'number' ? { confidence: path.metadata.confidence } : {}),
    ...(typeof path.metadata.freshness === 'string' ? { freshness: path.metadata.freshness } : {}),
    ...(typeof path.metadata.security === 'number' ? { security: path.metadata.security } : {}),
    ...(typeof path.metadata.trust === 'number' ? { trust: path.metadata.trust } : {}),
    ...(typeof path.metadata.cost === 'number' ? { cost: path.metadata.cost } : {}),
    failureDomains: pathFailureDomains(path),
});
export const DEFAULT_ROUTING_CONFIG = {
    minimumHealthScore: 40,
    minimumStabilityScore: 35,
    maxLatencyMs: 1500,
    maxPacketLoss: 0.25,
    hysteresis: 5,
    cooldownMs: 30_000,
    stabilityWindowMs: 60_000,
    flappingThreshold: 4,
    flappingWindowMs: 120_000,
    failoverRetries: 3,
    verificationTimeoutMs: 5_000,
    addressFamilyPreference: 'dual',
    allowedPathTypes: ['direct', 'vpn', 'proxy', 'tunnel', 'relay', 'overlay', 'multi-hop', 'custom'],
    maxHistory: 100,
    scoringWeights: {
        health: 3,
        latency: 1.2,
        packetLoss: 1.5,
        jitter: 0.6,
        stability: 2,
        policy: 1,
        connectivity: 1,
        metric: 0.5,
    },
};
const PRECEDENCE = [
    'security validation',
    'destination route intent',
    'manual deny/require',
    'policy deny',
    'address-family constraints',
    'longest-prefix match',
    'connectivity eligibility',
    'policy preference',
    'health',
    'stability',
    'performance',
    'route metric',
    'deterministic tie-breaker',
];
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const lowerBetter = (v, good, bad) => v === undefined ? 50 : clamp(100 - ((v - good) / (bad - good)) * 100);
export function parseDestination(value) {
    if (value === 'default' || value === '0.0.0.0/0' || value === '::/0')
        return {
            kind: 'default',
            value,
            family: value === '::/0' ? 'ipv6' : value === '0.0.0.0/0' ? 'ipv4' : 'dual',
        };
    if (value.includes('/'))
        return { kind: 'cidr', value, family: inferFamily(value.split('/')[0] ?? value) };
    if (isIp(value))
        return { kind: 'ip', value, family: inferFamily(value) };
    return { kind: 'hostname', value };
}
export function normalizeRoute(input) {
    const [base, cidrPrefix] = input.destination.split('/');
    const family = input.family && input.family !== 'dual' ? input.family : inferFamily(base ?? input.destination);
    const prefix = input.prefix ??
        (cidrPrefix
            ? Number(cidrPrefix)
            : input.destination === 'default'
                ? 0
                : family === 'ipv4'
                    ? 32
                    : 128);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 'ipv4' ? 32 : 128))
        throw new Error(`Invalid route prefix for ${input.destination}`);
    return {
        id: input.id ?? createId('route'),
        destination: base ?? input.destination,
        prefix,
        ...(input.gateway ? { gateway: input.gateway } : {}),
        ...(input.interfaceName ? { interfaceName: input.interfaceName } : {}),
        ...(input.source ? { source: input.source } : {}),
        protocol: input.protocol ?? 'provider',
        metric: input.metric ?? 100,
        table: {
            id: input.table?.id ?? 'main',
            kind: input.table?.kind ?? 'main',
            name: input.table?.name ?? 'main',
            metadata: input.table?.metadata,
        },
        family,
        scope: input.scope ?? 'global',
        state: input.state ?? 'available',
        health: {
            score: input.health?.score ?? 100,
            status: input.health?.status ?? 'healthy',
            checkedAt: input.health?.checkedAt ?? new Date(0).toISOString(),
            ...input.health,
        },
        priority: input.priority ?? 0,
        capabilities: [...new Set([family, ...(input.capabilities ?? [])])],
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        metadata: input.metadata ?? {},
    };
}
export function routeMatchesDestination(route, dest) {
    if (dest.kind === 'default')
        return route.prefix === 0;
    if ((dest.family === 'ipv4' || dest.family === 'ipv6') && route.family !== dest.family)
        return false;
    if (dest.kind !== 'ip' && dest.kind !== 'cidr')
        return route.prefix === 0 || route.destination === dest.value;
    const ip = dest.kind === 'cidr' ? (dest.value.split('/')[0] ?? dest.value) : dest.value;
    if (!isIp(ip) || inferFamily(ip) !== route.family)
        return false;
    return cidrContains(route.destination, route.prefix, ip, route.family);
}
export function longestPrefix(routes, dest) {
    const matched = routes.filter((r) => routeMatchesDestination(r, dest));
    const best = Math.max(-1, ...matched.map((r) => r.prefix));
    return matched.filter((r) => r.prefix === best);
}
export class StaticRouteDiscoveryProvider {
    id;
    routes;
    constructor(id, routes) {
        this.id = id;
        this.routes = routes;
    }
    async discoverRoutes() {
        return this.routes;
    }
}
export class RoutingEngine {
    options;
    providers = [];
    policies = [];
    factors = [];
    active = new Map();
    transitions = new Map();
    history = [];
    constructor(options = {}) {
        this.options = options;
        this.config = {
            ...DEFAULT_ROUTING_CONFIG,
            ...options.config,
            scoringWeights: {
                health: 3,
                latency: 1.2,
                packetLoss: 1.5,
                jitter: 0.6,
                stability: 2,
                policy: 1,
                connectivity: 1,
                metric: 0.5,
                ...(options.config?.scoringWeights ?? {}),
            },
        };
        this.factors = this.defaultFactors();
    }
    config;
    registerProvider(provider) {
        this.providers.push(provider);
    }
    registerPolicy(policy) {
        this.policies.push(policy);
    }
    registerScoreFactor(factor) {
        this.factors.push(factor);
    }
    registerExtension(extension) {
        extension.routeProviders?.forEach((p) => this.registerProvider(p));
        extension.policyProviders?.forEach((p) => this.registerPolicy(p));
        extension.scoringFactors?.forEach((f) => this.registerScoreFactor(f));
    }
    async simulateRouting(context) {
        return this.decide(context, true);
    }
    async decide(context, dryRun = false) {
        const start = performance.now();
        const now = context.now ?? new Date();
        const discovered = [...(context.routes ?? []), ...(await this.discover(context))];
        const routes = discovered.map(normalizeRoute);
        const matched = longestPrefix(routes, context.destination);
        const paths = await this.paths(matched, context);
        const graph = new NetworkPathGraph(paths, context.destination);
        const policyDecisions = [];
        const candidateResults = [];
        for (const path of paths) {
            const result = await this.candidate(path, context, now);
            candidateResults.push(result);
            policyDecisions.push(...result.policies);
        }
        const candidates = candidateResults.map((r) => r.candidate);
        const eligible = candidates.filter((c) => c.eligibility !== 'rejected');
        this.applyScores(eligible, context);
        eligible.sort((a, b) => b.totalScore - a.totalScore || a.metric - b.metric || a.route.id.localeCompare(b.route.id));
        const current = context.currentPathId
            ? (paths.find((p) => p.id === context.currentPathId) ??
                this.active.get(this.key(context.destination)))
            : this.active.get(this.key(context.destination));
        let selected = eligible[0];
        if (current && selected && current.id !== selected.path.id) {
            const currentCandidate = eligible.find((c) => c.path.id === current.id);
            if (currentCandidate &&
                selected.totalScore - currentCandidate.totalScore < this.config.hysteresis)
                selected = currentCandidate;
        }
        const flapping = this.isFlapping(now.getTime());
        if (flapping &&
            current &&
            selected &&
            current.id !== selected.path.id &&
            current.state !== 'failed') {
            selected = eligible.find((c) => c.path.id === current.id) ?? selected;
            await this.emit('routing.flapping.detected', {
                destination: context.destination,
                selectedPathId: selected.path.id,
            });
            this.metric('routing_flapping_total', 1);
        }
        if (selected)
            selected.eligibility = 'selected';
        const rejected = candidates.filter((c) => c.eligibility === 'rejected');
        const reason = selected
            ? `selected ${selected.path.id} by longest-prefix eligibility and score ${selected.totalScore}`
            : 'no eligible route candidates';
        const plan = {
            id: createId('route_plan'),
            destination: context.destination,
            ...(current ? { currentPath: current } : {}),
            candidatePaths: paths,
            ...(selected ? { selectedPath: selected.path } : {}),
            reason,
            policy: policyDecisions,
            actions: selected && current?.id !== selected.path.id
                ? [
                    {
                        type: 'apply-route',
                        capability: 'network.route',
                        input: { planId: 'pending', pathId: selected.path.id, routeId: selected.route.id },
                        description: 'apply selected route through kernel routing capability',
                    },
                    {
                        type: 'verify-route',
                        capability: 'network.route',
                        input: { pathId: selected.path.id },
                        description: 'verify selected path after kernel application',
                    },
                ]
                : [
                    {
                        type: 'noop',
                        capability: 'network.route',
                        input: {},
                        description: 'selected path already active or no eligible path',
                    },
                ],
            verification: {
                required: Boolean(selected && current?.id !== selected.path.id),
                timeoutMs: this.config.verificationTimeoutMs,
                strategy: dryRun ? 'simulation' : 'provider',
                status: dryRun ? 'skipped' : 'pending',
            },
            explanation: {
                matchedRouteIds: matched.map((r) => r.id),
                eligibleCandidateIds: eligible.map((c) => c.id),
                rejected: rejected.map((c) => ({
                    candidateId: c.id,
                    routeId: c.route.id,
                    reason: c.rejectionReason,
                    explanation: c.explanation,
                })),
                policy: policyDecisions,
                scores: Object.fromEntries(candidates.map((c) => [c.id, c.scoreComponents])),
                selectedCandidateId: selected?.id,
                reason,
                precedence: PRECEDENCE,
            },
            dryRun,
            createdAt: now.toISOString(),
        };
        this.metric('routing_decision_duration', performance.now() - start);
        this.metric('routing_decisions_total', 1);
        await this.emit('routing.decision.created', {
            planId: plan.id,
            destination: context.destination,
            selectedPathId: selected?.path.id,
            dryRun,
        });
        return {
            plan,
            candidates,
            selected,
            graph,
            aiContext: {
                destination: context.destination,
                currentPath: current,
                candidatePaths: paths,
                policies: policyDecisions,
                transitionHistory: this.history.slice(-10),
                pathGraph: graph,
            },
        };
    }
    async applyPlan(plan) {
        if (plan.dryRun || !plan.selectedPath)
            return plan;
        const key = this.key(plan.destination);
        if (this.transitions.has(key))
            return this.transitions.get(key);
        const run = this.commit(plan, key);
        this.transitions.set(key, run);
        try {
            return await run;
        }
        finally {
            this.transitions.delete(key);
        }
    }
    /**
     * Compensates a previously committed route transition using the plan's
     * captured currentPath. The kernel owns the privileged rollback; the active
     * path index is updated only after that operation succeeds.
     */
    async rollbackPlan(plan) {
        if (!plan.selectedPath || !this.options.kernel)
            return false;
        try {
            await this.options.kernel.execute('routing', 'rollbackRoutePlan', plan, {
                ...(this.options.principal ? { principal: this.options.principal } : {}),
                priority: 'critical',
                persist: true,
            });
            const key = this.key(plan.destination);
            if (plan.currentPath)
                this.active.set(key, plan.currentPath);
            else
                this.active.delete(key);
            await this.emit('routing.transition.rolled_back', {
                planId: plan.id,
                restoredPathId: plan.currentPath?.id,
            });
            this.metric('routing_path_switch_rollback_total', 1);
            return true;
        }
        catch (error) {
            await this.emit('routing.transition.rollback_failed', {
                planId: plan.id,
                error: error instanceof Error ? error.message : 'unknown',
            });
            this.metric('routing_path_switch_rollback_failure_total', 1);
            return false;
        }
    }
    /**
     * Tells the kernel's routing capability that an applied plan has been verified end to end, so
     * its journal can stop treating it as interrupted. Returns false (never throws) when the kernel
     * cannot confirm; the plan then stays journaled as unconfirmed and a restart reverts it, which
     * is the safe direction.
     */
    async confirmPlan(plan) {
        if (!this.options.kernel)
            return false;
        try {
            // The kernel bus resolves `undefined` (it does not throw) when no handler is registered for
            // an operation, so only an explicit acknowledgement counts as confirmation.
            const acknowledgement = await this.options.kernel.execute('routing', 'confirmRoutePlan', plan, {
                ...(this.options.principal ? { principal: this.options.principal } : {}),
                priority: 'high',
                persist: true,
            });
            return acknowledgement?.ok === true;
        }
        catch {
            return false;
        }
    }
    /**
     * Proves a rollback from observed state. Fails closed: with no provider able to observe the
     * outcome, or if any provider errors or disagrees, the rollback is reported as unproven.
     */
    async verifyRollback(plan) {
        const observers = this.providers.filter((p) => typeof p.verifyRolledBack === 'function');
        if (!observers.length)
            return false;
        let proven = true;
        for (const provider of observers) {
            try {
                proven = (await provider.verifyRolledBack(plan)) && proven;
            }
            catch {
                proven = false;
            }
        }
        return proven;
    }
    async failover(context) {
        await this.emit('routing.failover.started', { destination: context.destination });
        const decision = await this.decide(context);
        const plan = await this.applyPlan(decision.plan);
        await this.emit(plan.verification.status === 'succeeded' || plan.actions[0]?.type === 'noop'
            ? 'routing.failover.succeeded'
            : 'routing.failover.failed', { planId: plan.id });
        return plan;
    }
    async recover(context) {
        await this.emit('routing.recovery.started', { destination: context.destination });
        const decision = await this.decide(context);
        const plan = await this.applyPlan(decision.plan);
        await this.emit(plan.verification.status === 'succeeded' || plan.actions[0]?.type === 'noop'
            ? 'routing.recovery.succeeded'
            : 'routing.recovery.failed', { planId: plan.id });
        return plan;
    }
    setManualOverride(context, override) {
        void this.emit('routing.manual_override.changed', {
            destination: context.destination,
            override,
        });
        return { ...context, manualOverride: override.mode === 'clear' ? undefined : override };
    }
    async discover(context) {
        const all = (await Promise.all(this.providers.map((p) => p.discoverRoutes(context)))).flat();
        if (all.length)
            await this.emit('routing.route.discovered', { count: all.length });
        return all;
    }
    async paths(routes, context) {
        const providerPaths = (await Promise.all(this.providers.filter((p) => p.discoverPaths).map((p) => p.discoverPaths(routes, context)))).flat();
        const direct = routes.map((r) => ({
            id: `path:${r.id}`,
            type: r.metadata.pathType ?? 'direct',
            source: r.source ? parseSource(r.source) : undefined,
            hops: [r.gateway].filter(Boolean),
            route: r,
            provider: r.source,
            capabilities: r.capabilities,
            health: r.health,
            state: r.state,
            metadata: {},
        }));
        return [...providerPaths, ...direct];
    }
    async candidate(path, context, now) {
        const source = context.connectivitySources?.find((s) => s.sourceId === path.route.source ||
            s.id === path.route.source ||
            s.interfaceName === path.route.interfaceName);
        const health = path.health ?? source?.health;
        const c = {
            id: `candidate:${path.id}`,
            route: path.route,
            path,
            ...(source ? { connectivitySource: source } : {}),
            ...(path.route.gateway ? { gateway: path.route.gateway } : {}),
            ...(path.route.interfaceName ? { interfaceName: path.route.interfaceName } : {}),
            healthScore: health?.score ?? 100,
            latencyMs: health?.latencyMs,
            packetLoss: health?.packetLoss,
            jitterMs: health?.jitterMs,
            stability: health?.stability ?? 100,
            metric: path.route.metric,
            policyScore: 0,
            totalScore: 0,
            eligibility: 'eligible',
            explanation: [],
            scoreComponents: {},
        };
        const reject = (r, e) => {
            c.eligibility = 'rejected';
            c.rejectionReason = r;
            c.explanation.push(e);
        };
        const intent = context.destination.metadata?.routeIntent;
        if (intent === 'vpn-required' && path.type !== 'vpn')
            reject('destination-requires-vpn', `destination requires VPN but path type is ${path.type}`);
        else if (intent === 'vpn-preferred' && path.type !== 'vpn')
            c.policyScore -= 20;
        if (!this.config.allowedPathTypes.includes(path.type))
            reject('unknown-path-type', `path type ${path.type} is not enabled`);
        else if (path.route.state === 'disabled')
            reject('provider-disabled', 'route is disabled');
        else if (path.route.state === 'expired' ||
            (path.route.expiresAt && Date.parse(path.route.expiresAt) <= now.getTime()))
            reject('route-expired', 'route is expired');
        else if ((context.destination.family === 'ipv4' || context.destination.family === 'ipv6') &&
            path.route.family !== context.destination.family)
            reject('wrong-address-family', 'route family does not match destination');
        else if (health?.status === 'unhealthy' || c.healthScore < this.config.minimumHealthScore)
            reject('route-unhealthy', 'route health is below threshold');
        else if (c.stability < this.config.minimumStabilityScore)
            reject('flapping-stabilization', 'route stability is below threshold');
        else if (c.packetLoss !== undefined && c.packetLoss > this.config.maxPacketLoss)
            reject('route-unhealthy', 'packet loss exceeds threshold');
        else if (c.latencyMs !== undefined && c.latencyMs > this.config.maxLatencyMs)
            reject('route-unhealthy', 'latency exceeds threshold');
        else if (source && (!source.available || source.failed))
            reject('source-unavailable', 'connectivity source is unavailable');
        else if (source?.state === 'disabled')
            reject('provider-disabled', 'connectivity provider is disabled');
        else if (path.route.gateway && health?.gatewayReachable === false)
            reject('gateway-unreachable', 'gateway is unreachable');
        const policies = [];
        for (const policy of this.policies) {
            const policyContext = {
                destination: context.destination,
                route: path.route,
                path,
                ...(source ? { source } : {}),
                ...(context.profile ? { profile: context.profile } : {}),
                ...(context.manualOverride ? { manualOverride: context.manualOverride } : {}),
            };
            const decision = await policy.evaluate(policyContext);
            policies.push(decision);
            if (!decision.allowed) {
                reject('policy-prohibited', decision.reason ?? 'policy rejected route');
                await this.emit('routing.policy.rejected', {
                    routeId: path.route.id,
                    reason: decision.reason,
                });
            }
            if (decision.scoreAdjustment)
                c.policyScore += decision.scoreAdjustment;
        }
        const o = context.manualOverride;
        if (o && o.expiresAt && Date.parse(o.expiresAt) <= now.getTime())
            return { candidate: c, policies };
        if (o?.mode === 'deny-path' && o.target === path.id)
            reject('manual-override', o.reason);
        if (o?.mode === 'require-path' && o.target !== path.id)
            reject('manual-override', o.reason);
        if (o?.mode === 'prefer-path' && o.target === path.id)
            c.policyScore += 25;
        if (o?.mode === 'prefer-interface' && o.target === path.route.interfaceName)
            c.policyScore += 15;
        if (o?.mode === 'prefer-provider' && o.target === source?.providerId)
            c.policyScore += 15;
        if (o?.mode === 'prefer-family' && o.target === path.route.family)
            c.policyScore += 10;
        await this.emit('routing.candidate.evaluated', {
            candidateId: c.id,
            eligible: c.eligibility !== 'rejected',
            rejectionReason: c.rejectionReason,
        });
        return { candidate: c, policies };
    }
    applyScores(candidates, context) {
        for (const c of candidates) {
            let weighted = 0, total = 0;
            for (const f of this.factors) {
                const score = clamp(f.score(c, context));
                const weight = this.config.scoringWeights[f.id] ?? f.weight;
                c.scoreComponents[f.id] = score;
                weighted += score * weight;
                total += weight;
            }
            c.totalScore = Math.round(clamp(total ? weighted / total : 0));
            c.path.score = c.totalScore;
        }
    }
    defaultFactors() {
        return [
            { id: 'health', weight: 3, score: (c) => c.healthScore },
            {
                id: 'latency',
                weight: 1.2,
                score: (c) => lowerBetter(c.latencyMs, 10, this.config.maxLatencyMs),
            },
            {
                id: 'packetLoss',
                weight: 1.5,
                score: (c) => (c.packetLoss === undefined ? 90 : clamp(100 - c.packetLoss * 400)),
            },
            { id: 'jitter', weight: 0.6, score: (c) => lowerBetter(c.jitterMs, 5, 200) },
            { id: 'stability', weight: 2, score: (c) => c.stability },
            { id: 'policy', weight: 1, score: (c) => clamp(50 + c.policyScore) },
            {
                id: 'connectivity',
                weight: 1,
                score: (c) => c.connectivitySource?.score?.score ?? c.connectivitySource?.health?.score ?? 80,
            },
            { id: 'metric', weight: 0.5, score: (c) => lowerBetter(c.metric, 0, 1000) },
        ];
    }
    async commit(plan, key) {
        await this.emit('routing.transition.started', { planId: plan.id });
        // True once the kernel has accepted the mutation. From then on any failure must compensate,
        // because the system is no longer in its pre-mutation state.
        let kernelApplied = false;
        try {
            if (!this.options.kernel)
                throw new Error('Live route application requires a KernelRuntime');
            await this.options.kernel.execute('routing', 'applyRoutePlan', plan, {
                ...(this.options.principal ? { principal: this.options.principal } : {}),
                priority: 'high',
                persist: true,
            });
            kernelApplied = true;
            // Bind each verifier to its provider: class-based providers read `this`, and a detached
            // method call throws a TypeError that would otherwise surface as a failed transition.
            const verifiers = this.providers
                .filter((p) => typeof p.verify === 'function')
                .map((p) => (routePlan) => p.verify(routePlan));
            if (!verifiers.length)
                throw new Error('Live route application requires at least one verification provider');
            let verified = true;
            for (const verify of verifiers)
                verified = (await verify(plan)) && verified;
            if (!verified) {
                plan.verification.status = 'failed';
                await this.options.kernel.execute('routing', 'rollbackRoutePlan', plan, {
                    ...(this.options.principal ? { principal: this.options.principal } : {}),
                    priority: 'critical',
                    persist: true,
                });
                await this.emit('routing.transition.failed', {
                    planId: plan.id,
                    reason: 'verification failed',
                });
                this.metric('routing_path_switch_failure_total', 1);
                return plan;
            }
            const previous = this.active.get(key);
            this.active.set(key, plan.selectedPath);
            this.history.push({
                at: Date.now(),
                ...(previous ? { from: previous.id } : {}),
                to: plan.selectedPath.id,
            });
            this.history = this.history.slice(-this.config.maxHistory);
            plan.verification.status = 'succeeded';
            await this.emit('routing.path.selected', { planId: plan.id, pathId: plan.selectedPath.id });
            await this.emit('routing.transition.succeeded', { planId: plan.id });
            this.metric('routing_path_switch_success_total', 1);
            return plan;
        }
        catch (error) {
            plan.verification.status = 'failed';
            if (kernelApplied && this.options.kernel) {
                // The route was already written. Undo it rather than leave an unverified mutation behind.
                try {
                    await this.options.kernel.execute('routing', 'rollbackRoutePlan', plan, {
                        ...(this.options.principal ? { principal: this.options.principal } : {}),
                        priority: 'critical',
                        persist: true,
                    });
                }
                catch (rollbackError) {
                    await this.emit('routing.transition.rollback_failed', {
                        planId: plan.id,
                        error: rollbackError instanceof Error ? rollbackError.message : 'unknown',
                    });
                    this.metric('routing_path_switch_rollback_failure_total', 1);
                }
            }
            await this.emit('routing.transition.failed', {
                planId: plan.id,
                error: error instanceof Error ? error.message : 'unknown',
            });
            this.metric('routing_path_switch_failure_total', 1);
            return plan;
        }
    }
    isFlapping(now) {
        const recent = this.history.filter((h) => now - h.at <= this.config.flappingWindowMs);
        return (recent.length >= this.config.flappingThreshold && new Set(recent.map((h) => h.to)).size <= 2);
    }
    async emit(_type, _payload) {
        // Events are handled by the canonical runtime; routing does not maintain its own event bus.
    }
    metric(name, value) {
        this.options.metrics?.record(name, value, { component: 'routing' });
    }
    key(destination) {
        return `${destination.kind}:${destination.value}:${destination.port ?? '*'}`;
    }
}
function inferFamily(ip) {
    return ip.includes(':') ? 'ipv6' : 'ipv4';
}
function isIp(value) {
    return (/^\d{1,3}(\.\d{1,3}){3}$/.test(value) || (/^[0-9a-f:]+$/i.test(value) && value.includes(':')));
}
function ipToBigInt(ip, family) {
    if (family === 'ipv4')
        return ip.split('.').reduce((a, p) => (a << 8n) + BigInt(Number(p)), 0n);
    const expanded = expandIpv6(ip);
    return expanded
        .split(':')
        .reduce((a, p) => (a << 16n) + BigInt(Number.parseInt(p || '0', 16)), 0n);
}
function cidrContains(cidrIp, prefix, ip, family) {
    if (prefix === 0)
        return true;
    const bits = BigInt(family === 'ipv4' ? 32 : 128);
    const shift = bits - BigInt(prefix);
    return ipToBigInt(cidrIp, family) >> shift === ipToBigInt(ip, family) >> shift;
}
function expandIpv6(ip) {
    const [left = '', right = ''] = ip.split('::');
    const l = left ? left.split(':') : [];
    const r = right ? right.split(':') : [];
    return [...l, ...Array(8 - l.length - r.length).fill('0'), ...r]
        .map((x) => x.padStart(4, '0'))
        .join(':');
}
function parseSource(source) {
    const [providerId, resourceId] = source.split(':');
    return providerId && resourceId ? { providerId, resourceId } : undefined;
}
//# sourceMappingURL=index.js.map