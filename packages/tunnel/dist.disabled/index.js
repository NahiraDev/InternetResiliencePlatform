import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
const id = (p) => `${p}_${randomUUID()}`;
const now = () => new Date().toISOString();
export class TunnelError extends Error {
    code;
    classification;
    retryable;
    details;
    constructor(message, code, classification, retryable = false, details = {}) {
        super(message);
        this.code = code;
        this.classification = classification;
        this.retryable = retryable;
        this.details = details;
    }
}
export const tunnelErrors = {
    configuration: (m, d = {}) => new TunnelError(m, 'TunnelConfigurationError', 'configurationFailure', false, d),
    unsupported: (m, d = {}) => new TunnelError(m, 'TunnelUnsupportedProtocol', 'configurationFailure', false, d),
    auth: (m, d = {}) => new TunnelError(m, 'TunnelAuthenticationFailed', 'securityFailure', false, d),
    state: (m, d = {}) => new TunnelError(m, 'TunnelStateConflict', 'nonRetryable', false, d),
    policy: (m, d = {}) => new TunnelError(m, 'TunnelPolicyRejected', 'policyFailure', false, d),
    capability: (m, d = {}) => new TunnelError(m, 'TunnelCapabilityMismatch', 'configurationFailure', false, d),
    resource: (m, d = {}) => new TunnelError(m, 'TunnelResourceLimitExceeded', 'resourceFailure', true, d),
    dependency: (m, d = {}) => new TunnelError(m, 'TunnelProviderUnavailable', 'dependencyFailure', true, d),
};
const allowedTransitions = {
    registered: ['configured', 'destroyed'],
    configured: ['preparing', 'destroyed'],
    preparing: ['connecting', 'failed', 'disconnecting'],
    connecting: ['authenticating', 'establishing', 'failed', 'disconnecting'],
    authenticating: ['establishing', 'failed', 'disconnecting'],
    establishing: ['connected', 'failed', 'disconnecting'],
    connected: ['degraded', 'disconnecting', 'recovering', 'failed'],
    degraded: ['connected', 'recovering', 'disconnecting', 'failed'],
    recovering: ['connecting', 'connected', 'failed', 'disconnecting'],
    disconnecting: ['disconnected', 'failed'],
    disconnected: ['preparing', 'destroyed'],
    failed: ['recovering', 'disconnecting', 'destroyed'],
    destroyed: [],
};
export function transitionTunnel(tunnel, next) {
    if (!allowedTransitions[tunnel.state].includes(next))
        throw tunnelErrors.state(`Invalid tunnel state transition ${tunnel.state} -> ${next}`, {
            tunnelId: tunnel.id,
        });
    return { ...tunnel, state: next };
}
export function validateEndpoint(endpoint) {
    if (!endpoint.host || endpoint.host.length > 253 || /\s/.test(endpoint.host))
        throw tunnelErrors.configuration('Invalid endpoint host');
    if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535)
        throw tunnelErrors.configuration('Invalid endpoint port');
    if (![
        'wireguard',
        'openvpn',
        'socks5',
        'http-connect',
        'https-proxy',
        'ssh',
        'quic',
        'custom',
    ].includes(endpoint.protocol))
        throw tunnelErrors.unsupported('Unsupported endpoint protocol', {
            protocol: endpoint.protocol,
        });
}
export function validateTunnelConfiguration(config) {
    validateEndpoint(config.endpoint);
    if (config.credentialRef ||
        ['credentials', 'certificate', 'key', 'token'].includes(config.authentication.type)) {
        const refs = [
            config.credentialRef,
            config.authentication.credentialRef,
            config.authentication.certificateRef,
            config.authentication.keyRef,
            config.authentication.tokenRef,
        ].filter(Boolean);
        if (!refs.length)
            throw tunnelErrors.configuration('Credential based authentication requires a credential reference');
    }
    if (config.mtu.configuredMtu !== undefined &&
        (config.mtu.configuredMtu < 576 || config.mtu.configuredMtu > 9000))
        throw tunnelErrors.configuration('MTU must be between 576 and 9000');
    if (config.keepalive.enabled &&
        (config.keepalive.intervalMs < 10_000 ||
            config.keepalive.timeoutMs < 1_000 ||
            config.keepalive.timeoutMs >= config.keepalive.intervalMs))
        throw tunnelErrors.configuration('Invalid keepalive timing');
    if (config.timeoutMs < 1_000 || config.timeoutMs > 300_000)
        throw tunnelErrors.configuration('Invalid tunnel timeout');
    if (config.retryLimit < 0 || config.retryLimit > 10)
        throw tunnelErrors.configuration('Invalid retry limit');
    if (config.routingMode === 'splitTunnel' &&
        (!config.splitTunnel ||
            (!config.splitTunnel.includedDestinations.length &&
                !config.splitTunnel.excludedDestinations.length)))
        throw tunnelErrors.configuration('Split tunnel routing requires explicit destinations');
    if (config.securityProfile === 'strict') {
        if (config.authentication.type === 'none')
            throw tunnelErrors.auth('Strict security profile requires authentication');
        if (!config.capabilities.includes('healthCheck'))
            throw tunnelErrors.capability('Strict security profile requires health checks');
    }
}
export function redacted(value) {
    if (Array.isArray(value))
        return value.map(redacted);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => /password|private|token|secret|credential|certificate|authorization/i.test(k)
            ? [k, '[REDACTED]']
            : [k, redacted(v)]));
    return value;
}
export class TunnelProviderRegistry {
    maxProviders;
    providers = new Map();
    constructor(maxProviders = 100) {
        this.maxProviders = maxProviders;
    }
    register(provider) {
        if (this.providers.size >= this.maxProviders)
            throw tunnelErrors.resource('Provider limit exceeded');
        if (this.providers.has(provider.id))
            throw tunnelErrors.configuration('Duplicate tunnel provider', { providerId: provider.id });
        this.providers.set(provider.id, provider);
    }
    get(providerId) {
        return this.providers.get(providerId);
    }
    list() {
        return [...this.providers.values()];
    }
    findByCapabilities(required) {
        return this.list().filter((p) => required.every((c) => p.capabilities.includes(c)));
    }
    unregister(providerId) {
        this.providers.delete(providerId);
    }
}
export class TunnelSelector {
    select(request) {
        const scored = request.candidates
            .map((t) => this.score(t, request))
            .sort((a, b) => b.score - a.score);
        const selectedCandidate = scored.find((c) => c.eligible);
        return {
            candidates: scored,
            rejectedCandidates: scored.filter((c) => !c.eligible),
            policyConstraints: request.policy,
            selectedTunnel: selectedCandidate
                ? request.candidates.find((t) => t.id === selectedCandidate.tunnelId)
                : undefined,
            reason: selectedCandidate
                ? `Selected ${selectedCandidate.tunnelId} with score ${selectedCandidate.score}`
                : 'No eligible tunnel satisfied policy, health, capability, routing, and security constraints',
        };
    }
    score(tunnel, r) {
        const rejected = [];
        const p = r.policy;
        if (p.approvedProviders && !p.approvedProviders.includes(tunnel.providerId))
            rejected.push('provider-not-approved');
        if (p.approvedProtocols && !p.approvedProtocols.includes(tunnel.endpoint.protocol))
            rejected.push('protocol-not-approved');
        if (p.allowedEndpoints && !p.allowedEndpoints.includes(tunnel.endpoint.host))
            rejected.push('endpoint-not-allowed');
        if (p.routingModes && !p.routingModes.includes(r.routingMode))
            rejected.push('routing-mode-not-allowed');
        if (p.scopes && !p.scopes.includes(r.scope))
            rejected.push('scope-not-allowed');
        for (const c of [...r.requiredCapabilities, ...(p.requiredCapabilities ?? [])])
            if (!tunnel.capabilities.includes(c))
                rejected.push(`missing-${c}`);
        if (p.vpnRequired && tunnel.type !== 'vpn')
            rejected.push('vpn-required');
        if (p.proxyRequired && tunnel.type !== 'proxy')
            rejected.push('proxy-required');
        if (p.killSwitchRequired && !tunnel.capabilities.includes('killSwitch'))
            rejected.push('killswitch-required');
        if (r.securityProfile === 'strict' && tunnel.securityProfile !== 'strict')
            rejected.push('strict-security-required');
        const health = tunnel.health.status === 'healthy' ? 40 : tunnel.health.status === 'degraded' ? 15 : 0;
        const latency = Math.max(0, 20 - Math.floor((tunnel.health.latencyMs ?? 100) / 10));
        const security = tunnel.securityProfile === 'strict'
            ? 25
            : tunnel.securityProfile === 'secure'
                ? 20
                : tunnel.securityProfile === 'balanced'
                    ? 12
                    : 5;
        const capability = Math.min(15, tunnel.capabilities.length);
        return {
            tunnelId: tunnel.id,
            eligible: rejected.length === 0 && tunnel.state !== 'failed' && tunnel.state !== 'destroyed',
            rejectedReasons: rejected,
            score: rejected.length ? 0 : health + latency + security + capability,
            scoreComponents: { health, latency, security, capability },
            explanation: rejected.length
                ? rejected
                : ['eligible', `health=${tunnel.health.status}`, `security=${tunnel.securityProfile}`],
        };
    }
}
export class NoopLinuxTunnelAdapter {
    platform = 'linux';
    async prepare() { }
    async establish() { }
    async cleanup() { }
    async validateRouteContext() {
        return true;
    }
}
export class UnsupportedProtocolProvider {
    id;
    type;
    protocol;
    capabilities;
    endpoints;
    supportedScopes = [];
    supportedRoutingModes = [];
    constructor(id, type, protocol, capabilities = [], endpoints = []) {
        this.id = id;
        this.type = type;
        this.protocol = protocol;
        this.capabilities = capabilities;
        this.endpoints = endpoints;
    }
    async healthCheck() {
        return { status: 'unknown', checkedAt: now() };
    }
    async create() {
        throw tunnelErrors.unsupported(`${this.protocol} provider is declared but not implemented in this repository`);
    }
    async connect() {
        throw tunnelErrors.unsupported(`${this.protocol} connect is unsupported`);
    }
    async disconnect(_connection, _timeoutMs) { }
    async destroy() { }
}
export class TunnelManager {
    registry;
    events;
    metrics;
    limits;
    tunnels = new Map();
    connections = new Map();
    locks = new Set();
    shuttingDown = false;
    constructor(registry, events, metrics, limits = { maxTunnels: 100, maxConcurrentConnects: 5 }) {
        this.registry = registry;
        this.events = events;
        this.metrics = metrics;
        this.limits = limits;
    }
    async configure(providerId, config) {
        if (this.tunnels.size >= this.limits.maxTunnels)
            throw tunnelErrors.resource('Tunnel limit exceeded');
        validateTunnelConfiguration(config);
        const provider = this.registry.get(providerId);
        if (!provider)
            throw tunnelErrors.dependency('Tunnel provider unavailable', { providerId });
        const tunnel = await provider.create(config);
        this.tunnels.set(tunnel.id, tunnel);
        await this.publish('tunnel.configured', tunnel.id, {
            providerId,
            endpoint: config.endpoint.host,
            protocol: config.endpoint.protocol,
        });
        return tunnel;
    }
    getTunnel(tunnelId) {
        return this.tunnels.get(tunnelId);
    }
    async connect(tunnelId) {
        if (this.shuttingDown)
            throw tunnelErrors.state('Tunnel manager is shutting down');
        if (this.locks.has(tunnelId))
            throw tunnelErrors.state('Concurrent tunnel operation rejected');
        this.locks.add(tunnelId);
        const started = performance.now();
        this.metrics?.record('tunnel_connect_attempts_total', 1);
        let tunnel;
        try {
            tunnel = this.mustTunnel(tunnelId);
            const provider = this.mustProvider(tunnel.providerId);
            if (tunnel.state === 'failed') {
                tunnel = transitionTunnel(tunnel, 'recovering');
            }
            else if (tunnel.state === 'configured' || tunnel.state === 'disconnected') {
                tunnel = transitionTunnel(tunnel, 'preparing');
            }
            else if (tunnel.state !== 'recovering') {
                throw tunnelErrors.state('Tunnel cannot connect from its current state', {
                    tunnelId,
                    state: tunnel.state,
                });
            }
            this.tunnels.set(tunnelId, tunnel);
            await this.publish('tunnel.connect.started', tunnelId, {
                recovery: tunnel.state === 'recovering',
            });
            tunnel = transitionTunnel(tunnel, 'connecting');
            this.tunnels.set(tunnelId, tunnel);
            const conn = await provider.connect(tunnel);
            tunnel = {
                ...tunnel,
                state: 'connected',
                health: { ...tunnel.health, status: 'healthy', checkedAt: now() },
            };
            this.tunnels.set(tunnelId, tunnel);
            this.connections.set(conn.id, conn);
            this.metrics?.record('tunnel_connect_success_total', 1);
            this.metrics?.record('tunnel_handshake_duration', performance.now() - started);
            await this.publish('tunnel.connected', tunnelId, { connectionId: conn.id });
            return conn;
        }
        catch (error) {
            const current = this.tunnels.get(tunnelId) ?? tunnel;
            if (current && current.state !== 'failed' && current.state !== 'destroyed') {
                try {
                    this.tunnels.set(tunnelId, transitionTunnel(current, 'failed'));
                }
                catch {
                    // Preserve the original connection error; never manufacture a successful state.
                }
            }
            this.metrics?.record('tunnel_connect_failure_total', 1);
            await this.publish('tunnel.connect.failed', tunnelId, {
                error: error instanceof TunnelError ? error.code : 'unknown',
            });
            throw error;
        }
        finally {
            this.locks.delete(tunnelId);
        }
    }
    async disconnectTunnel(tunnelId) {
        if (this.locks.has(tunnelId))
            throw tunnelErrors.state('Concurrent tunnel operation rejected');
        this.locks.add(tunnelId);
        try {
            const tunnel = this.mustTunnel(tunnelId);
            const provider = this.mustProvider(tunnel.providerId);
            const connection = [...this.connections.values()].find((c) => c.tunnelId === tunnelId);
            this.tunnels.set(tunnelId, transitionTunnel(tunnel, 'disconnecting'));
            await this.publish('tunnel.disconnect.started', tunnelId, {});
            if (connection)
                await provider.disconnect(connection, 30_000);
            for (const [cid, c] of this.connections)
                if (c.tunnelId === tunnelId)
                    this.connections.delete(cid);
            this.tunnels.set(tunnelId, { ...this.mustTunnel(tunnelId), state: 'disconnected' });
            this.metrics?.record('tunnel_disconnect_total', 1);
            await this.publish('tunnel.disconnected', tunnelId, {});
        }
        catch (error) {
            const current = this.tunnels.get(tunnelId);
            if (current?.state === 'disconnecting') {
                try {
                    this.tunnels.set(tunnelId, transitionTunnel(current, 'failed'));
                }
                catch {
                    // Preserve the original teardown failure; never pretend the tunnel is disconnected.
                }
            }
            await this.publish('tunnel.disconnect.failed', tunnelId, {
                error: error instanceof TunnelError ? error.code : 'unknown',
            });
            throw error;
        }
        finally {
            this.locks.delete(tunnelId);
        }
    }
    async reconnectTunnel(tunnelId) {
        this.metrics?.record('tunnel_reconnect_total', 1);
        await this.publish('tunnel.reconnect.requested', tunnelId, {});
        const t = this.mustTunnel(tunnelId);
        const hasConnection = [...this.connections.values()].some((connection) => connection.tunnelId === tunnelId);
        if (t.state === 'connected' || t.state === 'degraded' || hasConnection)
            await this.disconnectTunnel(tunnelId);
        return this.connect(tunnelId);
    }
    async switchEndpoint(tunnelId, endpoint) {
        validateEndpoint(endpoint);
        const t = this.mustTunnel(tunnelId);
        this.tunnels.set(tunnelId, { ...t, endpoint, configuration: { ...t.configuration, endpoint } });
        await this.publish('tunnel.failover.requested', tunnelId, { endpoint: endpoint.host });
        const c = await this.reconnectTunnel(tunnelId);
        await this.publish('tunnel.failover.completed', tunnelId, { connectionId: c.id });
        return c;
    }
    async switchTunnel(_fromTunnelId, toTunnelId) {
        return this.reconnectTunnel(toTunnelId);
    }
    async switchProxy(_fromProxyId, toProxyId) {
        return this.reconnectTunnel(toProxyId);
    }
    async revalidateTunnel(tunnelId) {
        const t = this.mustTunnel(tunnelId);
        const h = (await this.mustProvider(t.providerId).healthCheck(t));
        this.tunnels.set(tunnelId, { ...t, health: h });
        await this.publish('tunnel.health.changed', tunnelId, {
            status: h.status,
            leakProtection: h.leakProtection,
        });
        return h;
    }
    async shutdown() {
        this.shuttingDown = true;
        await Promise.all([...this.tunnels.values()]
            .filter((t) => t.state === 'connected' || t.state === 'degraded')
            .map((t) => this.disconnectTunnel(t.id)));
    }
    mustTunnel(tunnelId) {
        const t = this.tunnels.get(tunnelId);
        if (!t)
            throw tunnelErrors.configuration('Unknown tunnel', { tunnelId });
        return t;
    }
    mustProvider(providerId) {
        const p = this.registry.get(providerId);
        if (!p)
            throw tunnelErrors.dependency('Tunnel provider unavailable', { providerId });
        return p;
    }
    async publish(type, aggregateId, payload) {
        await this.events?.publish({
            id: id('evt'),
            type,
            aggregateId,
            occurredAt: new Date(),
            payload: redacted(payload),
            metadata: { phase: '17' },
        });
    }
}
export function simulateTunnelSelection(request) {
    return new TunnelSelector().select(request);
}
export function simulateTunnelConnection(tunnel) {
    return redacted({
        tunnelId: tunnel.id,
        dryRun: true,
        expectedRouteImpact: tunnel.configuration.routingMode,
        expectedDnsImpact: tunnel.configuration.dnsMode,
        securityImplications: tunnel.securityProfile,
        credentials: tunnel.configuration.credentialRef,
    });
}
export function simulateFailover(from, candidates, policy) {
    return simulateTunnelSelection({
        candidates: candidates.filter((t) => t.id !== from.id),
        policy,
        routingMode: from.configuration.routingMode,
        scope: from.configuration.scope,
        requiredCapabilities: from.configuration.capabilities,
        securityProfile: from.securityProfile,
    });
}
export const supportedProtocolStatus = {
    WireGuard: 'implemented',
    OpenVPN: 'not implemented',
    SOCKS5: 'not implemented',
    'HTTP CONNECT': 'not implemented',
    'HTTPS proxy': 'not implemented',
};
export * from './wireguard.js';
export * from './lifecycle.js';
export * from './kill-switch.js';
//# sourceMappingURL=index.js.map