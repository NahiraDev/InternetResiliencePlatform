import type { GatewayHealth } from './health.js';
import type { GatewayMetadata } from './index.js';
import { type GatewayCapacity, type GatewaySelectionCandidate, type GatewaySelectionPolicy } from './selection.js';
export type GatewayFailoverState = 'idle' | 'selecting' | 'switching' | 'verifying' | 'succeeded' | 'exhausted';
export interface GatewayFailoverEvent {
    type: 'gateway.failover.started' | 'gateway.failover.candidate' | 'gateway.failover.switch_succeeded' | 'gateway.failover.switch_failed' | 'gateway.failover.rollback_succeeded' | 'gateway.failover.rollback_failed' | 'gateway.failover.succeeded' | 'gateway.failover.exhausted';
    gatewayId?: string;
    currentGatewayId?: string | undefined;
    attempt?: number;
    reason: string;
    occurredAt: string;
}
export interface GatewayFailoverTelemetry {
    publish(event: GatewayFailoverEvent): Promise<void> | void;
}
export interface GatewayFailoverVerification {
    healthy: boolean;
    reason?: string;
    health?: GatewayHealth;
}
export interface GatewayFailoverExecutor {
    switchGateway(candidate: GatewaySelectionCandidate, reason: string): Promise<GatewayFailoverVerification>;
    restoreGateway?(gatewayId: string, reason: string): Promise<GatewayFailoverVerification>;
}
export interface GatewayFailoverOptions {
    maxFailovers?: number;
    quarantineMs?: number;
    requireCurrentUnhealthy?: boolean;
}
export interface GatewayFailoverRequest {
    gateways: GatewayMetadata[];
    health: Map<string, GatewayHealth> | Record<string, GatewayHealth>;
    capacity?: Map<string, GatewayCapacity> | Record<string, GatewayCapacity>;
    currentGatewayId?: string;
    failedGatewayIds?: string[];
    policy?: Partial<GatewaySelectionPolicy>;
    now?: Date;
    reason?: string;
}
export interface GatewayFailoverAttempt {
    gatewayId: string;
    attempt: number;
    selectedScore: number;
    switched: boolean;
    verified: boolean;
    rolledBack?: boolean;
    reason: string;
}
export interface GatewayFailoverResult {
    state: GatewayFailoverState;
    switched: boolean;
    currentGatewayId?: string;
    selected?: GatewaySelectionCandidate;
    attempts: GatewayFailoverAttempt[];
    candidates: GatewaySelectionCandidate[];
    reason: string;
}
export declare class MultiGatewayFailover {
    private readonly executor;
    private readonly telemetry?;
    private readonly options;
    private readonly quarantinedUntil;
    private running;
    private state;
    constructor(executor: GatewayFailoverExecutor, telemetry?: GatewayFailoverTelemetry | undefined, options?: GatewayFailoverOptions);
    getState(): GatewayFailoverState;
    isQuarantined(gatewayId: string, nowMs?: number): boolean;
    clearQuarantine(gatewayId?: string): void;
    failover(request: GatewayFailoverRequest): Promise<GatewayFailoverResult>;
    private emit;
}
//# sourceMappingURL=failover.d.ts.map