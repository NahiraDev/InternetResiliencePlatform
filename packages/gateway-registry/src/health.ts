import type { GatewayEndpoint, GatewayId } from './index.js';

export type GatewayHealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'stale' | 'unknown';

export interface GatewayHealthSample {
  gatewayId: GatewayId;
  checkedAt: string;
  reachable: boolean;
  latencyMs?: number;
  packetLossPercent?: number;
}

export interface GatewayHealthPolicy {
  maxStalenessMs: number;
  healthyLatencyMs: number;
  degradedLatencyMs: number;
  healthyPacketLossPercent: number;
  degradedPacketLossPercent: number;
}

export interface GatewayHealth {
  gatewayId: GatewayId;
  status: GatewayHealthStatus;
  score: number;
  checkedAt?: string;
  latencyMs?: number;
  packetLossPercent?: number;
  reason: string;
}

export interface GatewayHealthProbe {
  probe(endpoint: GatewayEndpoint, timeoutMs: number): Promise<GatewayProbeResult>;
}

export interface GatewayProbeResult {
  reachable: boolean;
  latencyMs?: number;
  packetLossPercent?: number;
}

export const DEFAULT_GATEWAY_HEALTH_POLICY: GatewayHealthPolicy = {
  maxStalenessMs: 60_000,
  healthyLatencyMs: 100,
  degradedLatencyMs: 300,
  healthyPacketLossPercent: 1,
  degradedPacketLossPercent: 5,
};

function assertPolicy(policy: GatewayHealthPolicy): void {
  if (!Number.isFinite(policy.maxStalenessMs) || policy.maxStalenessMs <= 0) throw new Error('maxStalenessMs must be positive');
  if (!Number.isFinite(policy.healthyLatencyMs) || policy.healthyLatencyMs <= 0) throw new Error('healthyLatencyMs must be positive');
  if (!Number.isFinite(policy.degradedLatencyMs) || policy.degradedLatencyMs < policy.healthyLatencyMs) {
    throw new Error('degradedLatencyMs must be greater than or equal to healthyLatencyMs');
  }
  if (policy.healthyPacketLossPercent < 0 || policy.healthyPacketLossPercent > 100) throw new Error('healthyPacketLossPercent must be between 0 and 100');
  if (policy.degradedPacketLossPercent < policy.healthyPacketLossPercent || policy.degradedPacketLossPercent > 100) {
    throw new Error('degradedPacketLossPercent must be between healthyPacketLossPercent and 100');
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function evaluateGatewayHealth(
  sample: GatewayHealthSample,
  nowMs = Date.now(),
  policy: GatewayHealthPolicy = DEFAULT_GATEWAY_HEALTH_POLICY,
): GatewayHealth {
  assertPolicy(policy);
  const checkedAtMs = Date.parse(sample.checkedAt);
  if (!Number.isFinite(checkedAtMs)) throw new Error('checkedAt must be a valid ISO timestamp');
  if (checkedAtMs > nowMs + 5_000) throw new Error('checkedAt cannot be materially in the future');
  if (sample.latencyMs !== undefined && (!Number.isFinite(sample.latencyMs) || sample.latencyMs < 0)) throw new Error('latencyMs must be non-negative');
  if (sample.packetLossPercent !== undefined && (!Number.isFinite(sample.packetLossPercent) || sample.packetLossPercent < 0 || sample.packetLossPercent > 100)) {
    throw new Error('packetLossPercent must be between 0 and 100');
  }

  const base = {
    gatewayId: sample.gatewayId,
    checkedAt: sample.checkedAt,
    ...(sample.latencyMs === undefined ? {} : { latencyMs: sample.latencyMs }),
    ...(sample.packetLossPercent === undefined ? {} : { packetLossPercent: sample.packetLossPercent }),
  };

  if (nowMs - checkedAtMs > policy.maxStalenessMs) {
    return { ...base, status: 'stale', score: 0, reason: 'health sample is stale' };
  }

  if (!sample.reachable) {
    return { ...base, status: 'unreachable', score: 0, reason: 'gateway is unreachable' };
  }

  if (sample.latencyMs === undefined && sample.packetLossPercent === undefined) {
    return { ...base, status: 'unknown', score: 50, reason: 'reachable without quality measurements' };
  }

  const latencyScore = sample.latencyMs === undefined
    ? 100
    : sample.latencyMs <= policy.healthyLatencyMs
      ? 100
      : sample.latencyMs >= policy.degradedLatencyMs
        ? 0
        : 100 * (policy.degradedLatencyMs - sample.latencyMs) / (policy.degradedLatencyMs - policy.healthyLatencyMs);
  const lossScore = sample.packetLossPercent === undefined
    ? 100
    : sample.packetLossPercent <= policy.healthyPacketLossPercent
      ? 100
      : sample.packetLossPercent >= policy.degradedPacketLossPercent
        ? 0
        : 100 * (policy.degradedPacketLossPercent - sample.packetLossPercent) / (policy.degradedPacketLossPercent - policy.healthyPacketLossPercent);
  const score = clampScore((latencyScore + lossScore) / 2);

  if (score >= 80) return { ...base, status: 'healthy', score, reason: 'gateway is reachable with healthy quality' };
  return { ...base, status: 'degraded', score, reason: 'gateway is reachable but quality is degraded' };
}

export async function probeGatewayHealth(
  gatewayId: GatewayId,
  endpoint: GatewayEndpoint,
  probe: GatewayHealthProbe,
  timeoutMs: number,
): Promise<GatewayHealthSample> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');

  const result = await Promise.race([
    probe.probe(endpoint, timeoutMs),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('gateway health probe timed out')), timeoutMs)),
  ]);

  return {
    gatewayId,
    checkedAt: new Date().toISOString(),
    reachable: result.reachable,
    ...(result.latencyMs === undefined ? {} : { latencyMs: result.latencyMs }),
    ...(result.packetLossPercent === undefined ? {} : { packetLossPercent: result.packetLossPercent }),
  };
}
