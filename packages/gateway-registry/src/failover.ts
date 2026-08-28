import type { GatewayHealth } from './health.js';
import type { GatewayMetadata } from './index.js';
import {
  DEFAULT_GATEWAY_SELECTION_POLICY,
  selectGateway,
  type GatewayCapacity,
  type GatewaySelectionCandidate,
  type GatewaySelectionPolicy,
} from './selection.js';

export type GatewayFailoverState = 'idle' | 'selecting' | 'switching' | 'verifying' | 'succeeded' | 'exhausted';

export interface GatewayFailoverEvent {
  type:
    | 'gateway.failover.started'
    | 'gateway.failover.candidate'
    | 'gateway.failover.switch_succeeded'
    | 'gateway.failover.switch_failed'
    | 'gateway.failover.succeeded'
    | 'gateway.failover.exhausted';
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

const DEFAULTS: Required<GatewayFailoverOptions> = {
  maxFailovers: 3,
  quarantineMs: 30_000,
  requireCurrentUnhealthy: true,
};

function assertOptions(options: Required<GatewayFailoverOptions>): void {
  if (!Number.isInteger(options.maxFailovers) || options.maxFailovers < 1 || options.maxFailovers > 10) {
    throw new Error('maxFailovers must be an integer between 1 and 10');
  }
  if (!Number.isInteger(options.quarantineMs) || options.quarantineMs < 0 || options.quarantineMs > 3_600_000) {
    throw new Error('quarantineMs must be an integer between 0 and 3600000');
  }
}

function getHealth(
  values: Map<string, GatewayHealth> | Record<string, GatewayHealth>,
  id: string | undefined,
): GatewayHealth | undefined {
  if (!id) return undefined;
  return values instanceof Map ? values.get(id) : values[id];
}

export class MultiGatewayFailover {
  private readonly options: Required<GatewayFailoverOptions>;
  private readonly quarantinedUntil = new Map<string, number>();
  private running = false;
  private state: GatewayFailoverState = 'idle';

  constructor(
    private readonly executor: GatewayFailoverExecutor,
    private readonly telemetry?: GatewayFailoverTelemetry,
    options: GatewayFailoverOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
    assertOptions(this.options);
  }

  getState(): GatewayFailoverState {
    return this.state;
  }

  isQuarantined(gatewayId: string, nowMs = Date.now()): boolean {
    const until = this.quarantinedUntil.get(gatewayId);
    if (until === undefined) return false;
    if (until <= nowMs) {
      this.quarantinedUntil.delete(gatewayId);
      return false;
    }
    return true;
  }

  clearQuarantine(gatewayId?: string): void {
    if (gatewayId === undefined) this.quarantinedUntil.clear();
    else this.quarantinedUntil.delete(gatewayId);
  }

  async failover(request: GatewayFailoverRequest): Promise<GatewayFailoverResult> {
    if (this.running) throw new Error('Concurrent multi-gateway failover operation rejected');
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
    await this.emit({ type: 'gateway.failover.started', currentGatewayId: request.currentGatewayId, reason, occurredAt: now.toISOString() });

    try {
      const baseline = selectGateway({
        gateways: request.gateways,
        health: request.health,
        ...(request.capacity !== undefined ? { capacity: request.capacity } : {}),
        ...(request.currentGatewayId !== undefined ? { currentGatewayId: request.currentGatewayId } : {}),
        policy: {
          ...DEFAULT_GATEWAY_SELECTION_POLICY,
          ...(request.policy ?? {}),
        },
        now,
      });

      const currentHealth = getHealth(request.health, request.currentGatewayId);
      const currentCandidate = request.currentGatewayId
        ? baseline.candidates.find((candidate) => candidate.gateway.id === request.currentGatewayId)
        : undefined;
      if (
        this.options.requireCurrentUnhealthy &&
        request.currentGatewayId !== undefined &&
        currentCandidate?.eligible === true &&
        currentHealth !== undefined &&
        (currentHealth.status === 'healthy' || currentHealth.status === 'degraded')
      ) {
        this.state = 'idle';
        return {
          state: 'idle',
          switched: false,
          ...(request.currentGatewayId ? { currentGatewayId: request.currentGatewayId } : {}),
          attempts: [],
          candidates: baseline.candidates,
          reason: 'Failover was not required because the current gateway remains eligible and healthy enough under policy.',
        };
      }

      const excluded = new Set(request.failedGatewayIds ?? []);
      if (request.currentGatewayId) excluded.add(request.currentGatewayId);

      const candidates = baseline.candidates.filter(
        (candidate) => candidate.eligible && !excluded.has(candidate.gateway.id) && !this.isQuarantined(candidate.gateway.id, nowMs),
      );

      const attempts: GatewayFailoverAttempt[] = [];
      if (candidates.length === 0) {
        this.state = 'exhausted';
        const result: GatewayFailoverResult = {
          state: 'exhausted',
          switched: false,
          ...(request.currentGatewayId ? { currentGatewayId: request.currentGatewayId } : {}),
          attempts,
          candidates: baseline.candidates,
          reason: 'No eligible and non-quarantined gateway is available for failover.',
        };
        await this.emit({ type: 'gateway.failover.exhausted', currentGatewayId: request.currentGatewayId, reason: result.reason, occurredAt: new Date().toISOString() });
        return result;
      }

      const limited = candidates.slice(0, this.options.maxFailovers);
      for (let index = 0; index < limited.length; index += 1) {
        const candidate = limited[index]!;
        const attempt = index + 1;
        this.state = 'switching';
        await this.emit({ type: 'gateway.failover.candidate', gatewayId: candidate.gateway.id, currentGatewayId: request.currentGatewayId, attempt, reason, occurredAt: new Date().toISOString() });

        try {
          const verification = await this.executor.switchGateway(candidate, reason);
          this.state = 'verifying';
          const verified = verification.healthy;
          if (verified) {
            this.state = 'succeeded';
            const attemptRecord: GatewayFailoverAttempt = {
              gatewayId: candidate.gateway.id,
              attempt,
              selectedScore: candidate.score,
              switched: true,
              verified: true,
              reason: verification.reason ?? 'gateway switch verified healthy',
            };
            attempts.push(attemptRecord);
            await this.emit({ type: 'gateway.failover.switch_succeeded', gatewayId: candidate.gateway.id, currentGatewayId: request.currentGatewayId, attempt, reason: attemptRecord.reason, occurredAt: new Date().toISOString() });
            await this.emit({ type: 'gateway.failover.succeeded', gatewayId: candidate.gateway.id, currentGatewayId: request.currentGatewayId, attempt, reason: 'Gateway failover completed and post-switch verification passed.', occurredAt: new Date().toISOString() });
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
          attempts.push({
            gatewayId: candidate.gateway.id,
            attempt,
            selectedScore: candidate.score,
            switched: true,
            verified: false,
            reason: failureReason,
          });
          this.quarantinedUntil.set(candidate.gateway.id, nowMs + this.options.quarantineMs);
          await this.emit({ type: 'gateway.failover.switch_failed', gatewayId: candidate.gateway.id, currentGatewayId: request.currentGatewayId, attempt, reason: failureReason, occurredAt: new Date().toISOString() });
        } catch (error) {
          const failureReason = error instanceof Error ? error.message : 'gateway switch execution failed';
          attempts.push({
            gatewayId: candidate.gateway.id,
            attempt,
            selectedScore: candidate.score,
            switched: false,
            verified: false,
            reason: failureReason,
          });
          this.quarantinedUntil.set(candidate.gateway.id, nowMs + this.options.quarantineMs);
          await this.emit({ type: 'gateway.failover.switch_failed', gatewayId: candidate.gateway.id, currentGatewayId: request.currentGatewayId, attempt, reason: failureReason, occurredAt: new Date().toISOString() });
        }
      }

      this.state = 'exhausted';
      const finalReason = `All ${attempts.length} failover attempt(s) were exhausted without a verified healthy gateway.`;
      await this.emit({ type: 'gateway.failover.exhausted', currentGatewayId: request.currentGatewayId, reason: finalReason, occurredAt: new Date().toISOString() });
      return {
        state: 'exhausted',
        switched: false,
        ...(request.currentGatewayId ? { currentGatewayId: request.currentGatewayId } : {}),
        attempts,
        candidates: baseline.candidates,
        reason: finalReason,
      };
    } finally {
      this.running = false;
      if (this.state !== 'succeeded' && this.state !== 'exhausted') this.state = 'idle';
    }
  }

  private async emit(event: GatewayFailoverEvent): Promise<void> {
    await this.telemetry?.publish(event);
  }
}
