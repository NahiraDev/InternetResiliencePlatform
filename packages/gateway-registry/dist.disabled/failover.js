import { DEFAULT_GATEWAY_SELECTION_POLICY, selectGateway, } from './selection.js';
const DEFAULTS = {
    maxFailovers: 3,
    quarantineMs: 30_000,
    requireCurrentUnhealthy: true,
};
function assertOptions(options) {
    if (!Number.isInteger(options.maxFailovers) ||
        options.maxFailovers < 1 ||
        options.maxFailovers > 10)
        throw new Error('maxFailovers must be an integer between 1 and 10');
    if (!Number.isInteger(options.quarantineMs) ||
        options.quarantineMs < 0 ||
        options.quarantineMs > 3_600_000)
        throw new Error('quarantineMs must be an integer between 0 and 3600000');
}
function getHealth(values, id) {
    if (!id)
        return undefined;
    return values instanceof Map ? values.get(id) : values[id];
}
export class MultiGatewayFailover {
    executor;
    telemetry;
    options;
    quarantinedUntil = new Map();
    running = false;
    state = 'idle';
    constructor(executor, telemetry, options = {}) {
        this.executor = executor;
        this.telemetry = telemetry;
        this.options = { ...DEFAULTS, ...options };
        assertOptions(this.options);
    }
    getState() {
        return this.state;
    }
    isQuarantined(gatewayId, nowMs = Date.now()) {
        const until = this.quarantinedUntil.get(gatewayId);
        if (until === undefined)
            return false;
        if (until <= nowMs) {
            this.quarantinedUntil.delete(gatewayId);
            return false;
        }
        return true;
    }
    clearQuarantine(gatewayId) {
        if (gatewayId === undefined)
            this.quarantinedUntil.clear();
        else
            this.quarantinedUntil.delete(gatewayId);
    }
    async failover(request) {
        if (this.running)
            throw new Error('Concurrent multi-gateway failover operation rejected');
        this.running = true;
        this.state = 'selecting';
        const now = request.now ?? new Date();
        const nowMs = now.getTime();
        if (!Number.isFinite(nowMs)) {
            this.running = false;
            this.state = 'idle';
            throw new Error('now must be a valid date');
        }
        const reason = request.reason ?? 'current gateway failed health or connectivity verification';
        await this.emit({
            type: 'gateway.failover.started',
            currentGatewayId: request.currentGatewayId,
            reason,
            occurredAt: now.toISOString(),
        });
        try {
            const baseline = selectGateway({
                gateways: request.gateways,
                health: request.health,
                ...(request.capacity !== undefined ? { capacity: request.capacity } : {}),
                ...(request.currentGatewayId !== undefined
                    ? { currentGatewayId: request.currentGatewayId }
                    : {}),
                policy: { ...DEFAULT_GATEWAY_SELECTION_POLICY, ...(request.policy ?? {}) },
                now,
            });
            const currentHealth = getHealth(request.health, request.currentGatewayId);
            const currentCandidate = request.currentGatewayId
                ? baseline.candidates.find((candidate) => candidate.gateway.id === request.currentGatewayId)
                : undefined;
            if (this.options.requireCurrentUnhealthy &&
                request.currentGatewayId !== undefined &&
                currentCandidate?.eligible === true &&
                currentHealth !== undefined &&
                (currentHealth.status === 'healthy' || currentHealth.status === 'degraded')) {
                this.state = 'idle';
                return {
                    state: 'idle',
                    switched: false,
                    currentGatewayId: request.currentGatewayId,
                    attempts: [],
                    candidates: baseline.candidates,
                    reason: 'Failover was not required because the current gateway remains eligible and healthy enough under policy.',
                };
            }
            const excluded = new Set(request.failedGatewayIds ?? []);
            if (request.currentGatewayId)
                excluded.add(request.currentGatewayId);
            const candidates = baseline.candidates.filter((candidate) => candidate.eligible &&
                !excluded.has(candidate.gateway.id) &&
                !this.isQuarantined(candidate.gateway.id, nowMs));
            const attempts = [];
            if (!candidates.length) {
                this.state = 'exhausted';
                return {
                    state: 'exhausted',
                    switched: false,
                    ...(request.currentGatewayId ? { currentGatewayId: request.currentGatewayId } : {}),
                    attempts,
                    candidates: baseline.candidates,
                    reason: 'No eligible and non-quarantined gateway is available for failover.',
                };
            }
            for (let index = 0; index < Math.min(candidates.length, this.options.maxFailovers); index += 1) {
                const candidate = candidates[index];
                const attempt = index + 1;
                this.state = 'switching';
                await this.emit({
                    type: 'gateway.failover.candidate',
                    gatewayId: candidate.gateway.id,
                    currentGatewayId: request.currentGatewayId,
                    attempt,
                    reason,
                    occurredAt: new Date().toISOString(),
                });
                try {
                    const verification = await this.executor.switchGateway(candidate, reason);
                    this.state = 'verifying';
                    if (verification.healthy) {
                        this.state = 'succeeded';
                        attempts.push({
                            gatewayId: candidate.gateway.id,
                            attempt,
                            selectedScore: candidate.score,
                            switched: true,
                            verified: true,
                            rolledBack: false,
                            reason: verification.reason ?? 'gateway switch verified healthy',
                        });
                        await this.emit({
                            type: 'gateway.failover.switch_succeeded',
                            gatewayId: candidate.gateway.id,
                            currentGatewayId: request.currentGatewayId,
                            attempt,
                            reason: verification.reason ?? 'gateway switch verified healthy',
                            occurredAt: new Date().toISOString(),
                        });
                        await this.emit({
                            type: 'gateway.failover.succeeded',
                            gatewayId: candidate.gateway.id,
                            currentGatewayId: request.currentGatewayId,
                            attempt,
                            reason: 'Gateway failover completed and post-switch verification passed.',
                            occurredAt: new Date().toISOString(),
                        });
                        return {
                            state: 'succeeded',
                            switched: true,
                            currentGatewayId: candidate.gateway.id,
                            selected: candidate,
                            attempts,
                            candidates: baseline.candidates,
                            reason: 'Gateway failover completed and post-switch verification passed.',
                        };
                    }
                    const failureReason = verification.reason ?? 'post-switch verification failed';
                    let rolledBack = false;
                    if (request.currentGatewayId && this.executor.restoreGateway) {
                        try {
                            const restored = await this.executor.restoreGateway(request.currentGatewayId, `rollback after failed switch to ${candidate.gateway.id}: ${failureReason}`);
                            rolledBack = restored.healthy;
                            await this.emit({
                                type: restored.healthy
                                    ? 'gateway.failover.rollback_succeeded'
                                    : 'gateway.failover.rollback_failed',
                                gatewayId: request.currentGatewayId,
                                currentGatewayId: candidate.gateway.id,
                                attempt,
                                reason: restored.reason ??
                                    (restored.healthy
                                        ? 'previous gateway restored'
                                        : 'previous gateway restoration failed'),
                                occurredAt: new Date().toISOString(),
                            });
                        }
                        catch (error) {
                            await this.emit({
                                type: 'gateway.failover.rollback_failed',
                                gatewayId: request.currentGatewayId,
                                currentGatewayId: candidate.gateway.id,
                                attempt,
                                reason: error instanceof Error ? error.message : String(error),
                                occurredAt: new Date().toISOString(),
                            });
                        }
                    }
                    attempts.push({
                        gatewayId: candidate.gateway.id,
                        attempt,
                        selectedScore: candidate.score,
                        switched: true,
                        verified: false,
                        rolledBack,
                        reason: `${failureReason}${request.currentGatewayId && this.executor.restoreGateway ? (rolledBack ? '; previous gateway restored' : '; previous gateway restoration failed') : '; rollback adapter unavailable'}`,
                    });
                    this.quarantinedUntil.set(candidate.gateway.id, nowMs + this.options.quarantineMs);
                    await this.emit({
                        type: 'gateway.failover.switch_failed',
                        gatewayId: candidate.gateway.id,
                        currentGatewayId: request.currentGatewayId,
                        attempt,
                        reason: failureReason,
                        occurredAt: new Date().toISOString(),
                    });
                }
                catch (error) {
                    const failureReason = error instanceof Error ? error.message : 'gateway switch execution failed';
                    attempts.push({
                        gatewayId: candidate.gateway.id,
                        attempt,
                        selectedScore: candidate.score,
                        switched: false,
                        verified: false,
                        rolledBack: false,
                        reason: failureReason,
                    });
                    this.quarantinedUntil.set(candidate.gateway.id, nowMs + this.options.quarantineMs);
                    await this.emit({
                        type: 'gateway.failover.switch_failed',
                        gatewayId: candidate.gateway.id,
                        currentGatewayId: request.currentGatewayId,
                        attempt,
                        reason: failureReason,
                        occurredAt: new Date().toISOString(),
                    });
                }
            }
            this.state = 'exhausted';
            const finalReason = `All ${attempts.length} failover attempt(s) were exhausted without a verified healthy gateway.`;
            await this.emit({
                type: 'gateway.failover.exhausted',
                currentGatewayId: request.currentGatewayId,
                reason: finalReason,
                occurredAt: new Date().toISOString(),
            });
            return {
                state: 'exhausted',
                switched: false,
                ...(request.currentGatewayId ? { currentGatewayId: request.currentGatewayId } : {}),
                attempts,
                candidates: baseline.candidates,
                reason: finalReason,
            };
        }
        finally {
            this.running = false;
            if (this.state !== 'succeeded' && this.state !== 'exhausted')
                this.state = 'idle';
        }
    }
    async emit(event) {
        await this.telemetry?.publish(event);
    }
}
//# sourceMappingURL=failover.js.map