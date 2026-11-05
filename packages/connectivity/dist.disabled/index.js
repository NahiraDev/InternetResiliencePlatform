import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
export class ConnectivityError extends Error {
    code;
    details;
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
export class ProviderNotFound extends ConnectivityError {
    constructor(id) {
        super('ProviderNotFound', `Connectivity provider not found: ${id}`, { id });
    }
}
export class ResourceNotFound extends ConnectivityError {
    constructor(id) {
        super('ResourceNotFound', `Connectivity resource not found: ${id}`, { id });
    }
}
export class UnsupportedCapability extends ConnectivityError {
    constructor(capability, id) {
        super('UnsupportedCapability', `${id} does not support ${capability}`, { capability, id });
    }
}
export class InvalidTransition extends ConnectivityError {
    constructor(from, to) {
        super('InvalidTransition', `Invalid connectivity transition ${from} -> ${to}`, { from, to });
    }
}
export class SwitchRejected extends ConnectivityError {
    constructor(message, details = {}) {
        super('SwitchRejected', message, details);
    }
}
export class FailoverExhausted extends ConnectivityError {
    constructor() {
        super('FailoverExhausted', 'No eligible failover candidate could be activated and verified');
    }
}
export const defaultConnectivityConfig = () => ({
    priorities: {
        ethernet: 100,
        wifi: 80,
        'usb-tether': 60,
        cellular: 50,
        vpn: 40,
        proxy: 30,
        relay: 30,
        virtual: 20,
        custom: 10,
    },
    minimumHealthScore: 60,
    minimumStabilityScore: 60,
    minimumStabilityMs: 30_000,
    switchingHysteresis: 10,
    cooldownMs: 30_000,
    failoverRetryCount: 3,
    candidateTimeoutMs: 5_000,
    verificationTimeoutMs: 5_000,
    recoveryTimeoutMs: 60_000,
    flappingThreshold: 4,
    flappingWindowMs: 120_000,
    maxHistory: 25,
    failback: 'safe',
});
const validTransitions = {
    unknown: ['discovered', 'disabled', 'failed'],
    discovered: ['available', 'unavailable', 'disabled', 'failed'],
    available: ['connecting', 'connected', 'unavailable', 'degraded', 'disabled', 'failed'],
    unavailable: ['available', 'recovering', 'disabled', 'failed'],
    connecting: ['connected', 'available', 'failed'],
    connected: ['active', 'disconnecting', 'degraded', 'failed', 'disabled'],
    active: ['connected', 'degraded', 'failed', 'disconnecting', 'disabled'],
    degraded: ['active', 'connected', 'recovering', 'failed', 'unavailable', 'disabled'],
    failed: ['recovering', 'disabled', 'unavailable'],
    disconnecting: ['available', 'unavailable', 'failed'],
    recovering: ['available', 'connected', 'failed', 'disabled'],
    disabled: ['available', 'unavailable'],
};
export const assertConnectivityTransition = (from, to) => {
    if (from !== to && !validTransitions[from].includes(to))
        throw new InvalidTransition(from, to);
};
const sid = (x) => typeof x === 'string' ? x : `${x.providerId}:${x.resourceId}`;
const parseSid = (sourceId) => {
    const [providerId, ...rest] = sourceId.split(':');
    if (!providerId || rest.length === 0)
        throw new ResourceNotFound(sourceId);
    return { providerId, resourceId: rest.join(':') };
};
const band = (score) => score <= 0
    ? 'unusable'
    : score <= 20
        ? 'critical'
        : score <= 40
            ? 'poor'
            : score <= 60
                ? 'degraded'
                : score <= 80
                    ? 'healthy'
                    : 'excellent';
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
export class ConnectivityProviderRegistry {
    providers = new Map();
    register(provider) {
        if (!provider.id.trim())
            throw new ConnectivityError('ProviderRegistrationError', 'Provider id is required');
        if (this.providers.has(provider.id))
            throw new ConnectivityError('ProviderRegistrationError', `Provider already registered: ${provider.id}`);
        this.providers.set(provider.id, provider);
    }
    unregister(id) {
        if (!this.providers.delete(id))
            throw new ProviderNotFound(id);
    }
    get(id) {
        const p = this.providers.get(id);
        if (!p)
            throw new ProviderNotFound(id);
        return p;
    }
    list() {
        return [...this.providers.values()];
    }
}
export class ConnectivityManager {
    options;
    registry = new ConnectivityProviderRegistry();
    resources = new Map();
    failures = new Map();
    transitions = [];
    active;
    preferred;
    disabled = new Set();
    forced;
    transitionLock;
    lastSwitchAt = 0;
    stabilizationUntil = 0;
    config;
    constructor(options = {}) {
        this.options = options;
        this.config = {
            ...defaultConnectivityConfig(),
            ...options.config,
            priorities: { ...defaultConnectivityConfig().priorities, ...options.config?.priorities },
        };
        this.validateConfig();
    }
    async registerProvider(provider) {
        this.registry.register(provider);
        await this.audit('connectivity.provider.registered', {
            providerId: provider.id,
            type: provider.type,
        });
        this.metric('connectivity_providers_total', this.registry.list().length);
    }
    async unregisterProvider(id) {
        this.registry.unregister(id);
        for (const key of [...this.resources.keys()])
            if (key.startsWith(`${id}:`))
                this.resources.delete(key);
        if (this.active?.providerId === id)
            this.active = undefined;
        await this.audit('connectivity.provider.unregistered', { providerId: id });
        this.metric('connectivity_providers_total', this.registry.list().length);
    }
    getProviders() {
        return this.registry.list();
    }
    async discoverProviders() {
        return this.getProviders();
    }
    async discoverResources() {
        for (const provider of this.registry.list())
            for (const resource of await provider.discover()) {
                this.validateResource(provider, resource);
                const key = sid({ providerId: resource.providerId, resourceId: resource.id });
                const previous = this.resources.get(key);
                this.resources.set(key, {
                    ...resource,
                    priority: resource.priority ?? this.config.priorities[resource.type] ?? 0,
                });
                if (!previous)
                    await this.audit('connectivity.resource.discovered', {
                        sourceId: key,
                        providerId: provider.id,
                    });
                else if (previous.state !== resource.state)
                    await this.audit('connectivity.resource.changed', {
                        sourceId: key,
                        from: previous.state,
                        to: resource.state,
                    });
            }
        this.metric('connectivity_resources_total', this.resources.size);
        return this.getResources();
    }
    getResources() {
        return [...this.resources.values()];
    }
    getActiveSource() {
        return this.active ? this.source(sid(this.active)) : undefined;
    }
    getAvailableSources() {
        return this.sources().filter((s) => s.available && !this.disabled.has(s.sourceId));
    }
    getHealthySources() {
        return this.getAvailableSources().filter((s) => (s.health?.score ?? 0) >= this.config.minimumHealthScore &&
            s.health?.status !== 'unhealthy');
    }
    async selectSource() {
        return this.evaluate();
    }
    async evaluate() {
        await this.refreshHealth();
        const current = this.getActiveSource();
        const currentScore = current ? this.scoreSource(current) : undefined;
        const availableSources = this.getAvailableSources();
        const healthySources = this.getHealthySources();
        const candidates = availableSources.map((s) => this.candidate(s, current, currentScore));
        candidates.sort((a, b) => b.score.score - a.score.score ||
            (b.source.priority ?? 0) - (a.source.priority ?? 0) ||
            a.source.sourceId.localeCompare(b.source.sourceId));
        const selected = candidates.find((c) => c.decision === 'eligible');
        const policy = await this.options.policy?.({
            current,
            availableSources,
            healthySources,
            candidates,
            selected,
            reason: selected ? `selected ${selected.source.sourceId}` : 'no eligible source',
            policyConstraints: [],
            generatedAt: new Date().toISOString(),
        });
        const policyConstraints = policy?.constraints ?? [];
        if (selected && policy && !policy.allowed) {
            selected.decision = 'policy-rejected';
            selected.reasons.push(policy.reason ?? 'policy rejected transition');
        }
        return {
            current,
            availableSources,
            healthySources,
            candidates,
            selected: selected?.decision === 'eligible' ? selected : undefined,
            reason: selected?.decision === 'eligible'
                ? `selected ${selected.source.sourceId}`
                : current
                    ? `remain on ${current.sourceId}`
                    : 'no eligible source',
            policyConstraints,
            generatedAt: new Date().toISOString(),
        };
    }
    async activateSource(resourceId, reason = 'manual-request') {
        return this.switchSource(resourceId, reason, 'manual');
    }
    async deactivateSource(resourceId) {
        const id = parseSid(resourceId);
        const provider = this.registry.get(id.providerId);
        this.requireCapability(provider, 'deactivate', resourceId);
        await provider.deactivate(id.resourceId);
        if (this.active && sid(this.active) === resourceId)
            this.active = undefined;
        await this.audit('connectivity.source.deactivated', { sourceId: resourceId });
    }
    async switchSource(resourceId, reason = 'manual-request', trigger = 'manual') {
        return this.enqueue(async () => this.transitionTo(resourceId, reason, trigger));
    }
    async failover(reason = 'active-source-failed') {
        if (this.transitionLock)
            return this.transitionLock;
        await this.audit('connectivity.failover.started', {
            active: this.active ? sid(this.active) : null,
        });
        for (let i = 0; i < this.config.failoverRetryCount; i += 1) {
            const evaluation = await this.evaluate();
            const candidate = evaluation.candidates
                .filter((c) => !['current', 'disabled', 'unhealthy', 'missing-capability', 'policy-rejected'].includes(c.decision) &&
                c.source.sourceId !== (this.active ? sid(this.active) : '') &&
                c.source.failure.consecutiveFailures <= i)
                .at(0);
            if (!candidate)
                break;
            try {
                const t = await this.switchSource(candidate.source.sourceId, reason, 'health');
                await this.audit('connectivity.failover.succeeded', {
                    transitionId: t.id,
                    to: candidate.source.sourceId,
                });
                return t;
            }
            catch {
                this.markFailure(candidate.source.sourceId);
            }
        }
        await this.audit('connectivity.failover.failed', {
            active: this.active ? sid(this.active) : null,
        });
        throw new FailoverExhausted();
    }
    async failback() {
        if (!this.preferred || this.config.failback === 'disabled')
            return undefined;
        const preferred = this.source(sid(this.preferred));
        if (!preferred || preferred.active)
            return undefined;
        const c = this.candidate(preferred, this.getActiveSource(), this.getActiveSource() ? this.scoreSource(this.getActiveSource()) : undefined);
        if (['disabled', 'unhealthy', 'missing-capability', 'policy-rejected'].includes(c.decision))
            return undefined;
        await this.audit('connectivity.failback.started', { to: preferred.sourceId });
        try {
            const t = await this.switchSource(preferred.sourceId, 'preferred-source-recovered', 'recovery');
            await this.audit('connectivity.failback.succeeded', { transitionId: t.id });
            return t;
        }
        catch (e) {
            await this.audit('connectivity.failback.failed', {
                error: e instanceof Error ? e.message : String(e),
            });
            throw e;
        }
    }
    async recover(resourceId) {
        const s = this.source(resourceId);
        if (!s)
            throw new ResourceNotFound(resourceId);
        const stats = this.stats(resourceId);
        stats.recoveryAttempts += 1;
        await this.audit('connectivity.recovery.started', { sourceId: resourceId });
        const health = await this.registry.get(s.providerId).getHealth(s.id);
        this.resources.set(resourceId, {
            ...s,
            state: health.score >= this.config.minimumHealthScore ? 'available' : 'failed',
            health,
        });
        const ok = health.score >= this.config.minimumHealthScore;
        if (ok) {
            stats.lastRecovery = new Date().toISOString();
            stats.consecutiveSuccesses += 1;
            stats.consecutiveFailures = 0;
            await this.audit('connectivity.recovery.succeeded', { sourceId: resourceId });
        }
        else
            await this.audit('connectivity.recovery.failed', { sourceId: resourceId });
        return ok;
    }
    async manualOverride(mode, resourceId) {
        if (mode !== 'clear' && !resourceId)
            throw new ConnectivityError('ManualOverrideConflict', 'resourceId is required');
        if (resourceId && !this.source(resourceId))
            throw new ResourceNotFound(resourceId);
        if (mode === 'force')
            this.forced = parseSid(resourceId);
        if (mode === 'prefer')
            this.preferred = parseSid(resourceId);
        if (mode === 'disable')
            this.disabled.add(resourceId);
        if (mode === 'enable')
            this.disabled.delete(resourceId);
        if (mode === 'clear')
            this.forced = undefined;
        await this.audit('connectivity.manual_override', { mode, resourceId });
    }
    history() {
        return [...this.transitions];
    }
    async transitionTo(resourceId, reason, trigger) {
        if (this.active && sid(this.active) === resourceId)
            return {
                id: randomUUID(),
                from: this.active,
                to: this.active,
                reason,
                trigger,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                status: 'committed',
                metadata: { idempotent: true },
                failure: undefined,
                verification: undefined,
            };
        const target = this.source(resourceId);
        if (!target)
            throw new ResourceNotFound(resourceId);
        const provider = this.registry.get(target.providerId);
        this.requireCapability(provider, 'activate', resourceId);
        const transition = this.addTransition({
            from: this.active,
            to: parseSid(resourceId),
            reason,
            trigger,
            status: 'prepared',
        });
        const evaln = await this.evaluate();
        const candidate = evaln.candidates.find((c) => c.source.sourceId === resourceId);
        const bypass = trigger === 'manual' || trigger === 'health' || trigger === 'recovery';
        if (!candidate ||
            (candidate.decision !== 'eligible' && !bypass && target.sourceId !== sid(this.forced ?? '')))
            return this.reject(transition, 'SwitchRejected', candidate?.reasons.join('; ') ?? 'not eligible');
        if (candidate &&
            [
                'disabled',
                'unhealthy',
                'missing-capability',
                'failed-recently',
                'policy-rejected',
            ].includes(candidate.decision) &&
            target.sourceId !== sid(this.forced ?? ''))
            return this.reject(transition, 'SwitchRejected', candidate.reasons.join('; '));
        const start = performance.now();
        transition.status = 'activating';
        if (!target.connected && provider.capabilities(target.id).includes('connect')) {
            const connected = await provider.connect(target.id);
            if (!connected.ok) {
                this.markFailure(resourceId);
                return this.reject(transition, 'SourceActivationFailed', connected.error ?? 'connect failed');
            }
        }
        const activated = await provider.activate(target.id);
        this.metric('connectivity_activation_duration', performance.now() - start);
        if (!activated.ok) {
            this.markFailure(resourceId);
            return this.reject(transition, 'SourceActivationFailed', activated.error ?? 'activation failed');
        }
        transition.status = 'verifying';
        const verification = await provider.getHealth(target.id);
        transition.verification = verification;
        this.metric('connectivity_verification_duration', performance.now() - start);
        if (verification.score < this.config.minimumHealthScore &&
            target.sourceId !== sid(this.forced ?? '')) {
            this.markFailure(resourceId);
            return this.reject(transition, 'ConnectivityVerificationFailed', 'candidate verification failed');
        }
        const previous = this.active ? this.source(sid(this.active)) : undefined;
        this.active = parseSid(resourceId);
        this.preferred ??= this.active;
        this.resources.set(resourceId, { ...target, state: 'active', health: verification });
        if (previous && previous.sourceId !== resourceId) {
            const oldProvider = this.registry.get(previous.providerId);
            if (oldProvider.capabilities(previous.id).includes('deactivate'))
                await oldProvider.deactivate(previous.id);
            this.resources.set(previous.sourceId, { ...previous, state: 'connected' });
        }
        this.markSuccess(resourceId);
        this.lastSwitchAt = this.now();
        transition.status = 'committed';
        transition.completedAt = new Date().toISOString();
        this.recordTransition(resourceId);
        await this.audit('connectivity.active.changed', {
            from: previous?.sourceId,
            to: resourceId,
            reason,
        });
        this.metric('connectivity_active_source_changes_total', 1);
        this.metric('connectivity_switch_duration', performance.now() - start);
        return transition;
    }
    candidate(source, current, currentScore) {
        const score = this.scoreSource(source);
        const reasons = [...score.explanation];
        let decision = 'eligible';
        if (source.active)
            decision = 'current';
        else if (this.disabled.has(source.sourceId))
            decision = 'disabled';
        else if (!source.capabilities.includes('activate'))
            decision = 'missing-capability';
        else if ((source.health?.score ?? 0) < this.config.minimumHealthScore ||
            source.health?.status === 'unhealthy')
            decision = 'unhealthy';
        else if ((source.health?.stability ?? 100) < this.config.minimumStabilityScore)
            decision = 'unstable';
        else if (this.now() < this.stabilizationUntil)
            decision = 'unstable';
        else if (current &&
            currentScore &&
            score.score < currentScore.score + this.config.switchingHysteresis)
            decision = 'lower-score';
        else if (this.now() - this.lastSwitchAt < this.config.cooldownMs &&
            current &&
            (current.health?.score ?? 0) >= this.config.minimumHealthScore)
            decision = 'cooldown';
        else if (source.failure.consecutiveFailures >= this.config.failoverRetryCount)
            decision = 'failed-recently';
        if (this.forced && sid(this.forced) === source.sourceId && decision !== 'missing-capability')
            decision = 'eligible';
        reasons.push(decision);
        return { source, score, decision, reasons };
    }
    scoreSource(source) {
        const h = source.health;
        const priority = clamp(source.priority ?? this.config.priorities[source.type] ?? 0);
        const health = clamp(h?.score ?? 0);
        const latency = clamp(100 - (h?.latencyMs ?? 250) / 10);
        const loss = clamp(100 - (h?.packetLoss ?? 0) * 100);
        const jitter = clamp(100 - (h?.jitterMs ?? 0) * 2);
        const stability = clamp(h?.stability ?? 100 - source.failure.consecutiveFailures * 20);
        const reliability = clamp(100 - source.failure.failureCount * 5 + source.failure.successCount * 2);
        const capability = source.capabilities.includes('activate') ? 100 : 0;
        const score = clamp(health * 0.45 +
            priority * 0.15 +
            latency * 0.1 +
            loss * 0.1 +
            jitter * 0.05 +
            stability * 0.1 +
            reliability * 0.03 +
            capability * 0.02);
        const components = {
            health,
            priority,
            latency,
            packetLoss: loss,
            jitter,
            stability,
            reliability,
            capability,
        };
        this.metric('connectivity_source_health_score', health, { type: source.type });
        return {
            sourceId: source.sourceId,
            score,
            band: band(score),
            components,
            explanation: Object.entries(components).map(([k, v]) => `${k}:${v}`),
        };
    }
    source(resourceId) {
        const r = this.resources.get(resourceId);
        if (!r)
            return undefined;
        const active = this.active ? sid(this.active) === resourceId : false;
        const state = r.state;
        return {
            ...r,
            sourceId: resourceId,
            active,
            preferred: this.preferred ? sid(this.preferred) === resourceId : false,
            candidate: !active,
            available: ['available', 'connected', 'active', 'degraded'].includes(state),
            connected: ['connected', 'active', 'degraded'].includes(state),
            failed: state === 'failed',
            recovering: state === 'recovering',
            failure: this.stats(resourceId),
        };
    }
    sources() {
        return [...this.resources.keys()].map((k) => this.source(k)).filter(Boolean);
    }
    async refreshHealth() {
        const snap = await this.options.healthSnapshot?.();
        for (const [key, r] of this.resources) {
            const provider = this.registry.get(r.providerId);
            const health = r.health ?? (await provider.getHealth(r.id));
            const merged = snap ? this.mergeHealth(health, snap.score) : health;
            this.resources.set(key, { ...r, health: merged });
        }
    }
    mergeHealth(h, n) {
        return {
            ...h,
            score: Math.min(h.score, n.score),
            status: Math.min(h.score, n.score) >= 80
                ? 'healthy'
                : Math.min(h.score, n.score) >= 50
                    ? 'degraded'
                    : 'unhealthy',
            source: 'network-intelligence',
            factors: { ...h.factors, networkIntelligence: n.factors },
        };
    }
    validateResource(provider, resource) {
        if (resource.providerId !== provider.id)
            throw new ConnectivityError('ProviderRegistrationError', 'resource provider mismatch');
        if (!resource.id.trim())
            throw new ResourceNotFound(resource.id);
    }
    requireCapability(provider, cap, resourceId) {
        if (!provider.capabilities(parseSid(resourceId).resourceId).includes(cap))
            throw new UnsupportedCapability(cap, resourceId);
    }
    stats(id) {
        const current = this.failures.get(id) ?? {
            failureCount: 0,
            successCount: 0,
            switchCount: 0,
            recoveryAttempts: 0,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            lastFailure: undefined,
            lastRecovery: undefined,
            failureStartedAt: undefined,
            recentTransitions: [],
        };
        this.failures.set(id, current);
        return current;
    }
    markFailure(id) {
        const s = this.stats(id);
        s.failureCount += 1;
        s.consecutiveFailures += 1;
        s.consecutiveSuccesses = 0;
        s.lastFailure = new Date().toISOString();
        s.failureStartedAt ??= s.lastFailure;
    }
    markSuccess(id) {
        const s = this.stats(id);
        s.successCount += 1;
        s.consecutiveSuccesses += 1;
        s.consecutiveFailures = 0;
        s.failureStartedAt = undefined;
    }
    recordTransition(id) {
        const s = this.stats(id);
        s.switchCount += 1;
        s.recentTransitions = [...s.recentTransitions, String(this.now())].slice(-this.config.maxHistory);
        const recent = this.transitions
            .filter((t) => t.completedAt && this.now() - Date.parse(t.completedAt) < this.config.flappingWindowMs)
            .slice(-this.config.flappingThreshold);
        if (recent.length >= this.config.flappingThreshold) {
            this.stabilizationUntil = this.now() + this.config.cooldownMs;
            void this.audit('connectivity.flapping.detected', {
                transitions: recent.map((t) => t.id),
                stabilizationUntil: this.stabilizationUntil,
            });
            this.metric('connectivity_flapping_total', 1);
        }
    }
    addTransition(input) {
        const t = {
            id: randomUUID(),
            reason: input.reason,
            trigger: input.trigger,
            startedAt: new Date().toISOString(),
            completedAt: undefined,
            status: input.status,
            metadata: {},
            from: input.from,
            to: input.to,
            failure: undefined,
            verification: undefined,
        };
        this.transitions = [...this.transitions, t].slice(-this.config.maxHistory);
        return t;
    }
    reject(t, code, message) {
        t.status = 'rejected';
        t.completedAt = new Date().toISOString();
        t.failure = { code, message };
        throw new SwitchRejected(message, { transitionId: t.id, code });
    }
    async enqueue(fn) {
        while (this.transitionLock)
            await this.transitionLock.catch(() => undefined);
        const p = fn();
        this.transitionLock = p
            .then(() => undefined, () => undefined)
            .then(() => {
            this.transitionLock = undefined;
        });
        return p;
    }
    async audit(type, payload) {
        this.options.kernel?.context(this.options.principal).logger.info(type, payload);
    }
    metric(name, value, labels) {
        this.options.metrics?.record(name, value, labels);
    }
    now() {
        return this.options.now?.() ?? Date.now();
    }
    validateConfig() {
        if (this.config.minimumHealthScore < 0 || this.config.minimumHealthScore > 100)
            throw new ConnectivityError('CONFIG_INVALID', 'minimumHealthScore must be 0..100');
        if (this.config.failoverRetryCount < 1)
            throw new ConnectivityError('CONFIG_INVALID', 'failoverRetryCount must be >= 1');
    }
}
export class SimulationConnectivityProvider {
    id;
    type;
    resources = new Map();
    activationFailures = new Set();
    verificationFailures = new Set();
    constructor(id, type, inputs) {
        this.id = id;
        this.type = type;
        for (const input of inputs) {
            this.resources.set(input.id, {
                providerId: id,
                id: input.id,
                type,
                interfaceName: input.id,
                state: input.state ?? 'available',
                addresses: [],
                dnsServers: [],
                capabilities: input.capabilities ?? [
                    'connect',
                    'disconnect',
                    'activate',
                    'deactivate',
                    'monitor',
                    'health-check',
                ],
                ...(input.priority === undefined ? {} : { priority: input.priority }),
                metadata: { simulation: true },
                health: {
                    score: input.health.score ?? 100,
                    status: input.health.status ?? 'healthy',
                    checkedAt: input.health.checkedAt ?? new Date(0).toISOString(),
                    ...input.health,
                    source: 'simulation',
                },
            });
            if (input.activationFails)
                this.activationFailures.add(input.id);
            if (input.verificationFails)
                this.verificationFailures.add(input.id);
        }
    }
    async discover() {
        return [...this.resources.values()].map((r) => ({ ...r }));
    }
    async getState(resourceId) {
        return resourceId ? this.resource(resourceId).state : 'available';
    }
    async getHealth(resourceId) {
        const r = this.resource(resourceId ?? [...this.resources.keys()][0]);
        if (this.verificationFailures.has(r.id))
            return { ...r.health, score: 0, status: 'unhealthy' };
        return r.health;
    }
    capabilities(resourceId) {
        return [...this.resource(resourceId ?? [...this.resources.keys()][0]).capabilities];
    }
    async connect(resourceId) {
        return this.set(resourceId, 'connected');
    }
    async disconnect(resourceId) {
        return this.set(resourceId, 'available');
    }
    async activate(resourceId) {
        if (this.activationFailures.has(resourceId))
            return { ok: false, resourceId, error: 'simulated activation failure' };
        return this.set(resourceId, 'active');
    }
    async deactivate(resourceId) {
        return this.set(resourceId, 'connected');
    }
    setHealth(resourceId, health) {
        const r = this.resource(resourceId);
        this.resources.set(resourceId, {
            ...r,
            health: {
                ...r.health,
                ...health,
                checkedAt: new Date().toISOString(),
                source: 'simulation',
            },
        });
    }
    setActivationFailure(resourceId, fails) {
        if (fails)
            this.activationFailures.add(resourceId);
        else
            this.activationFailures.delete(resourceId);
    }
    setVerificationFailure(resourceId, fails) {
        if (fails)
            this.verificationFailures.add(resourceId);
        else
            this.verificationFailures.delete(resourceId);
    }
    resource(id) {
        const r = this.resources.get(id);
        if (!r)
            throw new ResourceNotFound(id);
        return r;
    }
    async set(resourceId, state) {
        const r = this.resource(resourceId);
        assertConnectivityTransition(r.state, state);
        this.resources.set(resourceId, { ...r, state });
        return { ok: true, resourceId, state };
    }
}
//# sourceMappingURL=index.js.map