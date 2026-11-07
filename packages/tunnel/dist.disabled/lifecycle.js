import { randomUUID } from 'node:crypto';
import { TunnelError, tunnelErrors, transitionTunnel, validateEndpoint, validateTunnelConfiguration, } from './index.js';
const DEFAULTS = {
    maxConnectAttempts: 3,
    connectTimeoutMs: 60_000,
    disconnectTimeoutMs: 30_000,
    healthTimeoutMs: 15_000,
    requireHealth: true,
    requireRouteValidation: true,
    killSwitchRequired: false,
};
function timeoutError(operation, timeoutMs) {
    return new TunnelError(`${operation} timed out after ${timeoutMs}ms`, 'TunnelLifecycleTimeout', 'retryable', true, { operation, timeoutMs });
}
async function withTimeout(promise, timeoutMs, operation) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000)
        throw tunnelErrors.configuration(`${operation} timeout must be at least 1000ms`);
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(timeoutError(operation, timeoutMs)), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
function isHealthy(health) {
    return (health.status === 'healthy' && health.connectivity && health.handshake && health.authenticated);
}
export class AutomatedTunnelLifecycle {
    registry;
    adapter;
    killSwitch;
    events;
    metrics;
    options;
    locks = new Set();
    connections = new Map();
    tunnels = new Map();
    constructor(registry, adapter, killSwitch, events, metrics, options = {}) {
        this.registry = registry;
        this.adapter = adapter;
        this.killSwitch = killSwitch;
        this.events = events;
        this.metrics = metrics;
        this.options = { ...DEFAULTS, ...options };
        if (this.options.maxConnectAttempts < 1 || this.options.maxConnectAttempts > 10)
            throw tunnelErrors.configuration('maxConnectAttempts must be between 1 and 10');
    }
    getTunnel(tunnelId) {
        return this.tunnels.get(tunnelId);
    }
    getConnection(tunnelId) {
        return [...this.connections.values()].find((connection) => connection.tunnelId === tunnelId);
    }
    async establish(providerId, config) {
        validateTunnelConfiguration(config);
        const provider = this.requireProvider(providerId);
        this.assertProviderCompatibility(provider, config);
        const tunnel = await provider.create(config);
        this.tunnels.set(tunnel.id, tunnel);
        await this.emit('tunnel.lifecycle.configured', tunnel.id, { providerId });
        try {
            return await this.connect(tunnel.id);
        }
        catch (error) {
            await this.rollbackCreatedTunnel(tunnel, provider);
            throw error;
        }
    }
    async connect(tunnelId) {
        this.lock(tunnelId);
        const startedAt = Date.now();
        let killSwitchEnabled = false;
        try {
            let tunnel = this.requireTunnel(tunnelId);
            const provider = this.requireProvider(tunnel.providerId);
            if (this.options.killSwitchRequired && !tunnel.capabilities.includes('killSwitch'))
                throw tunnelErrors.policy('Lifecycle requires a kill switch but the tunnel does not advertise one', { tunnelId });
            if (this.options.requireRouteValidation) {
                const routeValid = await withTimeout(this.adapter.validateRouteContext(tunnel, tunnel.configuration.metadata?.routeContext), this.options.healthTimeoutMs, 'route validation');
                if (!routeValid)
                    throw tunnelErrors.policy('Tunnel route context was rejected by the platform adapter', {
                        tunnelId,
                    });
            }
            if (tunnel.state === 'failed')
                tunnel = transitionTunnel(tunnel, 'recovering');
            if (tunnel.state === 'recovering')
                tunnel = transitionTunnel(tunnel, 'connecting');
            else if (tunnel.state === 'disconnected' || tunnel.state === 'configured')
                tunnel = transitionTunnel(tunnel, 'preparing');
            else if (tunnel.state !== 'preparing')
                throw tunnelErrors.state(`Cannot connect tunnel in state ${tunnel.state}`, { tunnelId });
            this.tunnels.set(tunnel.id, tunnel);
            await this.adapter.prepare(tunnel);
            if (this.requiresKillSwitch(tunnel)) {
                if (!this.killSwitch)
                    throw tunnelErrors.policy('A kill switch is required but no kill-switch implementation is configured');
                await withTimeout(this.killSwitch.enable(tunnel.id), this.options.healthTimeoutMs, 'kill switch enable');
                killSwitchEnabled = true;
            }
            let lastError;
            for (let attempt = 1; attempt <= this.options.maxConnectAttempts; attempt += 1) {
                try {
                    tunnel = this.requireTunnel(tunnelId);
                    if (tunnel.state === 'preparing')
                        tunnel = transitionTunnel(tunnel, 'connecting');
                    else if (tunnel.state === 'recovering')
                        tunnel = transitionTunnel(tunnel, 'connecting');
                    else if (tunnel.state !== 'connecting')
                        throw tunnelErrors.state(`Cannot retry tunnel from state ${tunnel.state}`, {
                            tunnelId,
                        });
                    this.tunnels.set(tunnel.id, tunnel);
                    await this.emit('tunnel.lifecycle.connecting', tunnel.id, { attempt });
                    const connection = await withTimeout(provider.connect(tunnel), this.options.connectTimeoutMs, 'tunnel connect');
                    this.connections.set(connection.id, connection);
                    tunnel = { ...this.requireTunnel(tunnelId), state: 'establishing' };
                    this.tunnels.set(tunnel.id, tunnel);
                    await this.adapter.establish(tunnel);
                    const health = await withTimeout(provider.healthCheck(tunnel), this.options.healthTimeoutMs, 'tunnel health check');
                    if (this.options.requireHealth && !isHealthy(health))
                        throw tunnelErrors.dependency('Tunnel connected but failed post-connect health verification', { tunnelId, healthStatus: health.status });
                    tunnel = {
                        ...this.requireTunnel(tunnelId),
                        state: 'connected',
                        health: health,
                    };
                    this.tunnels.set(tunnel.id, tunnel);
                    if (killSwitchEnabled) {
                        await withTimeout(this.killSwitch.disable(tunnel.id), this.options.healthTimeoutMs, 'kill switch disable');
                        killSwitchEnabled = false;
                    }
                    this.metrics?.record('tunnel_lifecycle_connect_success_total', 1, {
                        provider: provider.id,
                    });
                    this.metrics?.record('tunnel_lifecycle_connect_duration_ms', Date.now() - startedAt, {
                        provider: provider.id,
                    });
                    await this.emit('tunnel.lifecycle.connected', tunnel.id, {
                        connectionId: connection.id,
                        attempt,
                    });
                    return { tunnel, connection, health: health, attempts: attempt };
                }
                catch (error) {
                    lastError = error;
                    this.metrics?.record('tunnel_lifecycle_connect_retry_total', 1, {
                        provider: provider.id,
                    });
                    await this.emit('tunnel.lifecycle.connect_failed', tunnelId, {
                        attempt,
                        retryable: error instanceof TunnelError ? error.retryable : true,
                        error: error instanceof TunnelError ? error.code : 'unknown',
                    });
                    if (attempt >= this.options.maxConnectAttempts ||
                        (error instanceof TunnelError && !error.retryable))
                        break;
                    await this.prepareRetry(tunnelId, provider);
                }
            }
            throw lastError instanceof Error
                ? lastError
                : tunnelErrors.dependency('Tunnel connection failed');
        }
        catch (error) {
            this.metrics?.record('tunnel_lifecycle_connect_failure_total', 1);
            await this.markFailed(tunnelId, error);
            if (killSwitchEnabled && this.killSwitch) {
                try {
                    await withTimeout(this.killSwitch.enable(tunnelId), this.options.healthTimeoutMs, 'kill switch recovery enable');
                }
                catch {
                    await this.emit('tunnel.lifecycle.safety_action_failed', tunnelId, {
                        action: 'enable-kill-switch',
                    });
                }
            }
            throw error;
        }
        finally {
            this.unlock(tunnelId);
        }
    }
    async disconnect(tunnelId, destroy = false) {
        this.lock(tunnelId);
        try {
            const tunnel = this.requireTunnel(tunnelId);
            const provider = this.requireProvider(tunnel.providerId);
            const connection = this.getConnection(tunnelId);
            if (this.requiresKillSwitch(tunnel) && this.killSwitch)
                await withTimeout(this.killSwitch.enable(tunnelId), this.options.healthTimeoutMs, 'kill switch enable before disconnect');
            const disconnecting = this.toDisconnecting(tunnel);
            this.tunnels.set(tunnelId, disconnecting);
            await this.emit('tunnel.lifecycle.disconnecting', tunnelId, {});
            if (connection) {
                await withTimeout(provider.disconnect(connection, this.options.disconnectTimeoutMs), this.options.disconnectTimeoutMs, 'tunnel disconnect');
                this.connections.delete(connection.id);
            }
            await this.adapter.cleanup(tunnel);
            const disconnected = { ...this.requireTunnel(tunnelId), state: 'disconnected' };
            this.tunnels.set(tunnelId, disconnected);
            await this.emit('tunnel.lifecycle.disconnected', tunnelId, {});
            if (destroy) {
                await provider.destroy(disconnected);
                this.tunnels.set(tunnelId, { ...disconnected, state: 'destroyed' });
                await this.emit('tunnel.lifecycle.destroyed', tunnelId, {});
            }
        }
        finally {
            this.unlock(tunnelId);
        }
    }
    async reconnect(tunnelId) {
        const current = this.requireTunnel(tunnelId);
        if (current.state === 'connected' || current.state === 'degraded')
            await this.disconnect(tunnelId);
        return this.connect(tunnelId);
    }
    async rotate(tunnelId, changes = {}) {
        if (changes.endpoint)
            validateEndpoint(changes.endpoint);
        this.lock(tunnelId);
        try {
            const current = this.requireTunnel(tunnelId);
            const configuration = {
                ...current.configuration,
                ...(changes.endpoint ? { endpoint: changes.endpoint } : {}),
                ...(changes.authentication ? { authentication: changes.authentication } : {}),
                ...(changes.credentialRef !== undefined ? { credentialRef: changes.credentialRef } : {}),
            };
            validateTunnelConfiguration(configuration);
            this.tunnels.set(tunnelId, { ...current, endpoint: configuration.endpoint, configuration });
            await this.emit('tunnel.lifecycle.rotation_requested', tunnelId, {
                endpointChanged: Boolean(changes.endpoint),
                credentialChanged: Boolean(changes.credentialRef || changes.authentication),
            });
        }
        finally {
            this.unlock(tunnelId);
        }
        return this.reconnect(tunnelId);
    }
    async shutdown() {
        const active = [...this.tunnels.values()].filter((tunnel) => tunnel.state === 'connected' || tunnel.state === 'degraded');
        for (const tunnel of active) {
            try {
                await this.disconnect(tunnel.id);
            }
            catch {
                await this.emit('tunnel.lifecycle.shutdown_failed', tunnel.id, {});
            }
        }
    }
    requiresKillSwitch(tunnel) {
        return (this.options.killSwitchRequired ||
            tunnel.configuration.securityProfile === 'strict' ||
            tunnel.configuration.routingMode === 'fullTunnel');
    }
    assertProviderCompatibility(provider, config) {
        if (provider.protocol !== config.endpoint.protocol)
            throw tunnelErrors.configuration('Provider protocol does not match tunnel endpoint protocol', {
                providerId: provider.id,
                providerProtocol: provider.protocol,
                endpointProtocol: config.endpoint.protocol,
            });
        if (!provider.supportedScopes.includes(config.scope))
            throw tunnelErrors.capability('Provider does not support the requested tunnel scope', {
                providerId: provider.id,
                scope: config.scope,
            });
        if (!provider.supportedRoutingModes.includes(config.routingMode))
            throw tunnelErrors.capability('Provider does not support the requested routing mode', {
                providerId: provider.id,
                routingMode: config.routingMode,
            });
        for (const capability of config.capabilities)
            if (!provider.capabilities.includes(capability))
                throw tunnelErrors.capability(`Provider does not support required capability ${capability}`, { providerId: provider.id, capability });
    }
    async prepareRetry(tunnelId, provider) {
        const tunnel = this.requireTunnel(tunnelId);
        const connection = this.getConnection(tunnelId);
        if (connection) {
            try {
                await withTimeout(provider.disconnect(connection, this.options.disconnectTimeoutMs), this.options.disconnectTimeoutMs, 'retry disconnect');
            }
            finally {
                this.connections.delete(connection.id);
            }
        }
        await this.adapter.cleanup(tunnel);
        this.tunnels.set(tunnelId, transitionTunnel({ ...tunnel, state: 'failed' }, 'recovering'));
    }
    async rollbackCreatedTunnel(tunnel, provider) {
        try {
            const connection = this.getConnection(tunnel.id);
            if (connection) {
                await provider.disconnect(connection, this.options.disconnectTimeoutMs);
                this.connections.delete(connection.id);
            }
            await this.adapter.cleanup(tunnel);
            await provider.destroy(tunnel);
            this.tunnels.delete(tunnel.id);
        }
        catch {
            await this.emit('tunnel.lifecycle.rollback_failed', tunnel.id, {});
        }
    }
    markFailed(tunnelId, error) {
        const tunnel = this.tunnels.get(tunnelId);
        if (!tunnel || tunnel.state === 'destroyed')
            return;
        const failed = { ...tunnel, state: 'failed' };
        this.tunnels.set(tunnelId, failed);
        void this.emit('tunnel.lifecycle.failed', tunnelId, {
            error: error instanceof TunnelError ? error.code : 'unknown',
        });
    }
    toDisconnecting(tunnel) {
        return tunnel.state === 'disconnecting' ? tunnel : transitionTunnel(tunnel, 'disconnecting');
    }
    requireTunnel(tunnelId) {
        const tunnel = this.tunnels.get(tunnelId);
        if (!tunnel)
            throw tunnelErrors.configuration('Tunnel not found', { tunnelId });
        return tunnel;
    }
    requireProvider(providerId) {
        const provider = this.registry.get(providerId);
        if (!provider)
            throw tunnelErrors.dependency('Tunnel provider not found', { providerId });
        return provider;
    }
    lock(tunnelId) {
        if (this.locks.has(tunnelId))
            throw tunnelErrors.state('Concurrent tunnel lifecycle operation rejected', { tunnelId });
        this.locks.add(tunnelId);
    }
    unlock(tunnelId) {
        this.locks.delete(tunnelId);
    }
    async emit(type, aggregateId, payload) {
        if (!this.events)
            return;
        await this.events.publish({
            id: randomUUID(),
            type,
            aggregateId,
            occurredAt: new Date(),
            payload,
        });
    }
}
//# sourceMappingURL=lifecycle.js.map