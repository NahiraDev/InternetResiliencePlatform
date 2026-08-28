import type { GatewayHealth, GatewayHealthStatus } from './health.js';
import type { GatewayMetadata } from './index.js';

export type GatewaySelectionRejectionReason =
  | 'not-active'
  | 'not-trusted'
  | 'health-unacceptable'
  | 'stale-health'
  | 'capacity-unavailable'
  | 'capacity-limit'
  | 'policy-denied'
  | 'region-not-allowed'
  | 'provider-not-allowed'
  | 'tag-missing'
  | 'protocol-missing'
  | 'address-family-missing';

export interface GatewayCapacity {
  utilizationPercent: number;
  availableCapacityPercent?: number;
  checkedAt: string;
}

export interface GatewaySelectionPolicy {
  allowedRegions: string[];
  allowedProviderIds: string[];
  requiredTags: string[];
  requiredTunnelProtocol?: string;
  requiredAddressFamily?: 'ipv4' | 'ipv6' | 'dual';
  minimumHealthScore: number;
  maximumLatencyMs: number;
  maximumPacketLossPercent: number;
  maximumUtilizationPercent: number;
  requireFreshHealth: boolean;
  maxHealthAgeMs: number;
  allowDegradedHealth: boolean;
  preferredRegions: string[];
  preferredProviderIds: string[];
  hysteresisScore: number;
}

export const DEFAULT_GATEWAY_SELECTION_POLICY: GatewaySelectionPolicy = {
  allowedRegions: [],
  allowedProviderIds: [],
  requiredTags: [],
  minimumHealthScore: 40,
  maximumLatencyMs: 1_500,
  maximumPacketLossPercent: 25,
  maximumUtilizationPercent: 90,
  requireFreshHealth: true,
  maxHealthAgeMs: 60_000,
  allowDegradedHealth: true,
  preferredRegions: [],
  preferredProviderIds: [],
  hysteresisScore: 5,
};

export interface GatewaySelectionCandidate {
  gateway: GatewayMetadata;
  health: GatewayHealth;
  capacity?: GatewayCapacity;
  eligible: boolean;
  score: number;
  rejectionReason?: GatewaySelectionRejectionReason;
  explanation: string[];
  scoreComponents: Record<string, number>;
}

export interface GatewaySelectionRequest {
  gateways: GatewayMetadata[];
  health: Map<string, GatewayHealth> | Record<string, GatewayHealth>;
  capacity?: Map<string, GatewayCapacity> | Record<string, GatewayCapacity> | undefined;
  currentGatewayId?: string;
  policy?: Partial<GatewaySelectionPolicy>;
  now?: Date;
}

export interface GatewaySelectionResult {
  selected?: GatewaySelectionCandidate;
  candidates: GatewaySelectionCandidate[];
  reason: string;
  switched: boolean;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function getValue<T>(values: Map<string, T> | Record<string, T>, id: string): T | undefined {
  return values instanceof Map ? values.get(id) : values[id];
}

function assertPolicy(policy: GatewaySelectionPolicy): void {
  if (!Number.isFinite(policy.minimumHealthScore) || policy.minimumHealthScore < 0 || policy.minimumHealthScore > 100) {
    throw new Error('minimumHealthScore must be between 0 and 100');
  }
  if (!Number.isFinite(policy.maximumLatencyMs) || policy.maximumLatencyMs <= 0) {
    throw new Error('maximumLatencyMs must be positive');
  }
  if (!Number.isFinite(policy.maximumPacketLossPercent) || policy.maximumPacketLossPercent < 0 || policy.maximumPacketLossPercent > 100) {
    throw new Error('maximumPacketLossPercent must be between 0 and 100');
  }
  if (!Number.isFinite(policy.maximumUtilizationPercent) || policy.maximumUtilizationPercent <= 0 || policy.maximumUtilizationPercent > 100) {
    throw new Error('maximumUtilizationPercent must be between 0 and 100');
  }
  if (!Number.isFinite(policy.maxHealthAgeMs) || policy.maxHealthAgeMs <= 0) {
    throw new Error('maxHealthAgeMs must be positive');
  }
  if (!Number.isFinite(policy.hysteresisScore) || policy.hysteresisScore < 0 || policy.hysteresisScore > 100) {
    throw new Error('hysteresisScore must be between 0 and 100');
  }
}

function preferredScore(value: string | undefined, preferred: string[]): number {
  if (!value || preferred.length === 0) return 0;
  const index = preferred.indexOf(value);
  return index === -1 ? 0 : 100 - index * (100 / Math.max(preferred.length, 1));
}

function qualityScore(health: GatewayHealth, policy: GatewaySelectionPolicy): number {
  const latency = health.latencyMs === undefined
    ? 50
    : clamp(100 - (health.latencyMs / policy.maximumLatencyMs) * 100);
  const loss = health.packetLossPercent === undefined
    ? 50
    : clamp(100 - (health.packetLossPercent / policy.maximumPacketLossPercent) * 100);
  return (health.score * 0.6) + (latency * 0.25) + (loss * 0.15);
}

function capacityScore(capacity: GatewayCapacity | undefined): number {
  if (!capacity) return 50;
  return clamp(100 - capacity.utilizationPercent);
}

function validateCapacity(capacity: GatewayCapacity): void {
  if (!Number.isFinite(capacity.utilizationPercent) || capacity.utilizationPercent < 0 || capacity.utilizationPercent > 100) {
    throw new Error('capacity utilizationPercent must be between 0 and 100');
  }
  if (capacity.availableCapacityPercent !== undefined &&
      (!Number.isFinite(capacity.availableCapacityPercent) || capacity.availableCapacityPercent < 0 || capacity.availableCapacityPercent > 100)) {
    throw new Error('capacity availableCapacityPercent must be between 0 and 100');
  }
  if (!Number.isFinite(Date.parse(capacity.checkedAt))) throw new Error('capacity checkedAt must be a valid ISO timestamp');
}

function reject(
  gateway: GatewayMetadata,
  health: GatewayHealth,
  capacity: GatewayCapacity | undefined,
  reason: GatewaySelectionRejectionReason,
  explanation: string[],
): GatewaySelectionCandidate {
  return {
    gateway,
    health,
    ...(capacity ? { capacity } : {}),
    eligible: false,
    score: 0,
    rejectionReason: reason,
    explanation,
    scoreComponents: {},
  };
}

function evaluateCandidate(
  gateway: GatewayMetadata,
  health: GatewayHealth | undefined,
  capacity: GatewayCapacity | undefined,
  policy: GatewaySelectionPolicy,
  nowMs: number,
): GatewaySelectionCandidate {
  if (!health) {
    return reject(gateway, {
      gatewayId: gateway.id,
      status: 'unknown',
      score: 0,
      reason: 'no health evidence',
    }, capacity, 'health-unacceptable', ['No health evidence is available.']);
  }

  if (gateway.lifecycle !== 'active') return reject(gateway, health, capacity, 'not-active', [`Gateway lifecycle is ${gateway.lifecycle}.`]);
  if (gateway.trust !== 'trusted') return reject(gateway, health, capacity, 'not-trusted', [`Gateway trust is ${gateway.trust}.`]);
  if (health.status === 'stale') return reject(gateway, health, capacity, 'stale-health', ['Gateway health evidence is stale.']);
  if (health.status === 'unreachable' || health.status === 'unknown' || (health.status === 'degraded' && !policy.allowDegradedHealth)) {
    return reject(gateway, health, capacity, 'health-unacceptable', [`Gateway health status is ${health.status}.`]);
  }
  const checkedAt = health.checkedAt ? Date.parse(health.checkedAt) : NaN;
  if (policy.requireFreshHealth && (!Number.isFinite(checkedAt) || nowMs - checkedAt > policy.maxHealthAgeMs)) {
    return reject(gateway, health, capacity, 'stale-health', ['Gateway health evidence is outside the freshness policy.']);
  }
  if (health.score < policy.minimumHealthScore) {
    return reject(gateway, health, capacity, 'health-unacceptable', [`Health score ${health.score} is below ${policy.minimumHealthScore}.`]);
  }
  if (health.latencyMs !== undefined && health.latencyMs > policy.maximumLatencyMs) {
    return reject(gateway, health, capacity, 'health-unacceptable', [`Latency ${health.latencyMs}ms exceeds ${policy.maximumLatencyMs}ms.`]);
  }
  if (health.packetLossPercent !== undefined && health.packetLossPercent > policy.maximumPacketLossPercent) {
    return reject(gateway, health, capacity, 'health-unacceptable', [`Packet loss ${health.packetLossPercent}% exceeds ${policy.maximumPacketLossPercent}%.`]);
  }
  if (capacity) validateCapacity(capacity);
  if (capacity && capacity.utilizationPercent > policy.maximumUtilizationPercent) {
    return reject(gateway, health, capacity, 'capacity-limit', [`Capacity utilization ${capacity.utilizationPercent}% exceeds ${policy.maximumUtilizationPercent}%.`]);
  }
  if (policy.allowedRegions.length > 0 && (!gateway.region || !policy.allowedRegions.includes(gateway.region))) {
    return reject(gateway, health, capacity, 'region-not-allowed', ['Gateway region is outside the allowed region policy.']);
  }
  if (policy.allowedProviderIds.length > 0 && (!gateway.providerId || !policy.allowedProviderIds.includes(gateway.providerId))) {
    return reject(gateway, health, capacity, 'provider-not-allowed', ['Gateway provider is outside the allowed provider policy.']);
  }
  if (policy.requiredTags.some((tag) => !gateway.tags.includes(tag))) {
    return reject(gateway, health, capacity, 'tag-missing', ['Gateway does not satisfy all required tags.']);
  }
  if (policy.requiredTunnelProtocol && !gateway.capabilities.tunnelProtocols.includes(policy.requiredTunnelProtocol)) {
    return reject(gateway, health, capacity, 'protocol-missing', [`Gateway does not support ${policy.requiredTunnelProtocol}.`]);
  }
  if (policy.requiredAddressFamily && !gateway.capabilities.addressFamilies.includes(policy.requiredAddressFamily)) {
    return reject(gateway, health, capacity, 'address-family-missing', [`Gateway does not support ${policy.requiredAddressFamily}.`]);
  }

  const healthComponent = health.score;
  const qualityComponent = qualityScore(health, policy);
  const capacityComponent = capacityScore(capacity);
  const regionComponent = preferredScore(gateway.region, policy.preferredRegions);
  const providerComponent = preferredScore(gateway.providerId, policy.preferredProviderIds);
  const score = Math.round(
    healthComponent * 0.4 +
    qualityComponent * 0.25 +
    capacityComponent * 0.2 +
    regionComponent * 0.1 +
    providerComponent * 0.05,
  );

  const explanation = [
    `Health score: ${healthComponent}.`,
    `Quality score: ${Math.round(qualityComponent)}.`,
    `Capacity score: ${Math.round(capacityComponent)}.`,
  ];
  if (regionComponent > 0) explanation.push(`Preferred region score: ${Math.round(regionComponent)}.`);
  if (providerComponent > 0) explanation.push(`Preferred provider score: ${Math.round(providerComponent)}.`);

  return {
    gateway,
    health,
    ...(capacity ? { capacity } : {}),
    eligible: true,
    score,
    explanation,
    scoreComponents: {
      health: healthComponent,
      quality: qualityComponent,
      capacity: capacityComponent,
      region: regionComponent,
      provider: providerComponent,
    },
  };
}

export function selectGateway(request: GatewaySelectionRequest): GatewaySelectionResult {
  const policy: GatewaySelectionPolicy = {
    ...DEFAULT_GATEWAY_SELECTION_POLICY,
    ...(request.policy ?? {}),
    preferredRegions: [...(request.policy?.preferredRegions ?? DEFAULT_GATEWAY_SELECTION_POLICY.preferredRegions)],
    preferredProviderIds: [...(request.policy?.preferredProviderIds ?? DEFAULT_GATEWAY_SELECTION_POLICY.preferredProviderIds)],
    allowedRegions: [...(request.policy?.allowedRegions ?? DEFAULT_GATEWAY_SELECTION_POLICY.allowedRegions)],
    allowedProviderIds: [...(request.policy?.allowedProviderIds ?? DEFAULT_GATEWAY_SELECTION_POLICY.allowedProviderIds)],
    requiredTags: [...(request.policy?.requiredTags ?? DEFAULT_GATEWAY_SELECTION_POLICY.requiredTags)],
  };
  assertPolicy(policy);
  const nowMs = (request.now ?? new Date()).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('now must be a valid date');

  const candidates = request.gateways
    .map((gateway) => evaluateCandidate(gateway, getValue(request.health, gateway.id), getValue(request.capacity ?? new Map(), gateway.id), policy, nowMs))
    .sort((a, b) => b.score - a.score || a.gateway.id.localeCompare(b.gateway.id));

  const eligible = candidates.filter((candidate) => candidate.eligible);
  const selectedCandidate = eligible[0];
  if (!selectedCandidate) return { candidates, reason: 'No gateway satisfies the selection policy and current evidence.', switched: false };

  let selected = selectedCandidate;
  let switched = request.currentGatewayId !== undefined && request.currentGatewayId !== selected.gateway.id;
  if (request.currentGatewayId) {
    const current = eligible.find((candidate) => candidate.gateway.id === request.currentGatewayId);
    if (current && selected.gateway.id !== current.gateway.id && selected.score < current.score + policy.hysteresisScore) {
      selected = {
        ...current,
        explanation: [...current.explanation, `Retained current gateway because challenger did not exceed hysteresis by ${policy.hysteresisScore} points.`],
      };
      switched = false;
    }
  }

  return {
    selected,
    candidates,
    reason: switched ? `Selected ${selected.gateway.id} using policy, health and capacity evidence.` : `Retained ${selected.gateway.id} as the deterministic best eligible gateway.`,
    switched,
  };
}

export function gatewayHealthStatusIsSelectable(status: GatewayHealthStatus, allowDegradedHealth: boolean): boolean {
  return status === 'healthy' || (status === 'degraded' && allowDegradedHealth);
}
