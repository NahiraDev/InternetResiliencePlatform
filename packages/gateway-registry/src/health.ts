import type { GatewayEndpoint, GatewayId } from './index.js';

export type GatewayHealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'stale' | 'unknown';

/**
 * What a health observation actually proved.
 *
 * The distinction is load-bearing: a gateway must never be reported operational merely
 * because a TCP connection succeeded or because a connectivity source was selected.
 *
 * - `transport`: the endpoint's transport answered (for example a TCP connect succeeded, or a
 *   UDP datagram could be emitted). This proves the address is reachable and nothing else.
 * - `protocol`: the tunnel protocol itself completed a valid exchange (for example a fresh
 *   WireGuard handshake). This proves the peer speaks the protocol and shares the session keys.
 * - `egress`: traffic actually left the host through this gateway and reached an external
 *   destination. This is the strongest evidence and the only one that may describe a gateway
 *   as operational.
 *
 * Evidence that is absent proves nothing stronger than `transport`, so evaluation treats an
 * absent value as `transport` and fails closed.
 */
export type GatewayProbeEvidence = 'transport' | 'protocol' | 'egress';

export interface GatewayHealthSample {
  gatewayId: GatewayId;
  checkedAt: string;
  reachable: boolean;
  /** What the observation proved. Absent means "no stronger than transport". */
  evidence?: GatewayProbeEvidence;
  /**
   * `false` when the probe cannot speak the gateway's transport at all (for example a TCP probe
   * aimed at a UDP-only tunnel peer). Such an observation carries no evidence and must not be
   * reported as an unreachable gateway.
   */
  applicable?: boolean;
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
  /** What the underlying observation proved. */
  evidence?: GatewayProbeEvidence;
  latencyMs?: number;
  packetLossPercent?: number;
  reason: string;
}

export interface GatewayHealthProbe {
  /**
   * The transport this probe speaks. `undefined` means the probe is transport agnostic.
   *
   * A selection plane uses this to refuse a probe that cannot speak a gateway's transport: a TCP
   * probe aimed at a UDP-only tunnel peer would otherwise report a healthy peer as unreachable.
   */
  readonly transport?: 'tcp' | 'udp' | 'any';
  probe(endpoint: GatewayEndpoint, timeoutMs: number): Promise<GatewayProbeResult>;
  probeGateways?(
    gateways: { id: string; endpoint: GatewayEndpoint }[],
  ): Promise<GatewayHealthSample[]>;
}

export interface GatewayProbeResult {
  reachable: boolean;
  /** What the probe proved. Absent means "no stronger than transport". */
  evidence?: GatewayProbeEvidence;
  /** `false` when the probe cannot speak this gateway's transport. */
  applicable?: boolean;
  latencyMs?: number;
  packetLossPercent?: number;
  error?: string;
  detail?: string;
}

export const DEFAULT_GATEWAY_HEALTH_POLICY: GatewayHealthPolicy = {
  maxStalenessMs: 60_000,
  healthyLatencyMs: 100,
  degradedLatencyMs: 300,
  healthyPacketLossPercent: 1,
  degradedPacketLossPercent: 5,
};

function assertPolicy(policy: GatewayHealthPolicy): void {
  if (!Number.isFinite(policy.maxStalenessMs) || policy.maxStalenessMs <= 0)
    throw new Error('maxStalenessMs must be positive');
  if (!Number.isFinite(policy.healthyLatencyMs) || policy.healthyLatencyMs <= 0)
    throw new Error('healthyLatencyMs must be positive');
  if (
    !Number.isFinite(policy.degradedLatencyMs) ||
    policy.degradedLatencyMs < policy.healthyLatencyMs
  ) {
    throw new Error('degradedLatencyMs must be greater than or equal to healthyLatencyMs');
  }
  if (policy.healthyPacketLossPercent < 0 || policy.healthyPacketLossPercent > 100)
    throw new Error('healthyPacketLossPercent must be between 0 and 100');
  if (
    policy.degradedPacketLossPercent < policy.healthyPacketLossPercent ||
    policy.degradedPacketLossPercent > 100
  ) {
    throw new Error('degradedPacketLossPercent must be between healthyPacketLossPercent and 100');
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const EVIDENCE_VALUES: readonly GatewayProbeEvidence[] = ['transport', 'protocol', 'egress'];

/**
 * The strongest status a given evidence class may claim.
 *
 * `transport` may never be `healthy`: a reachable transport is not an operational gateway.
 */
const MAX_STATUS_BY_EVIDENCE: Record<GatewayProbeEvidence, GatewayHealthStatus> = {
  transport: 'degraded',
  protocol: 'healthy',
  egress: 'healthy',
};

export function evaluateGatewayHealth(
  sample: GatewayHealthSample,
  nowMs = Date.now(),
  policy: GatewayHealthPolicy = DEFAULT_GATEWAY_HEALTH_POLICY,
): GatewayHealth {
  assertPolicy(policy);
  const checkedAtMs = Date.parse(sample.checkedAt);
  if (!Number.isFinite(checkedAtMs)) throw new Error('checkedAt must be a valid ISO timestamp');
  if (checkedAtMs > nowMs + 5_000) throw new Error('checkedAt cannot be materially in the future');
  if (
    sample.latencyMs !== undefined &&
    (!Number.isFinite(sample.latencyMs) || sample.latencyMs < 0)
  )
    throw new Error('latencyMs must be non-negative');
  if (
    sample.packetLossPercent !== undefined &&
    (!Number.isFinite(sample.packetLossPercent) ||
      sample.packetLossPercent < 0 ||
      sample.packetLossPercent > 100)
  ) {
    throw new Error('packetLossPercent must be between 0 and 100');
  }
  if (sample.evidence !== undefined && !EVIDENCE_VALUES.includes(sample.evidence))
    throw new Error(`evidence must be one of ${EVIDENCE_VALUES.join(', ')}`);

  // An observation without evidence proves nothing stronger than transport reachability.
  const evidence: GatewayProbeEvidence = sample.evidence ?? 'transport';

  const base = {
    gatewayId: sample.gatewayId,
    checkedAt: sample.checkedAt,
    evidence,
    ...(sample.latencyMs === undefined ? {} : { latencyMs: sample.latencyMs }),
    ...(sample.packetLossPercent === undefined
      ? {}
      : { packetLossPercent: sample.packetLossPercent }),
  };

  if (nowMs - checkedAtMs > policy.maxStalenessMs) {
    return { ...base, status: 'stale', score: 0, reason: 'health sample is stale' };
  }

  // A probe that cannot speak the gateway's transport produced no observation at all.
  if (sample.applicable === false) {
    return {
      ...base,
      status: 'unknown',
      score: 0,
      reason: 'the probe is not applicable to this gateway transport; no evidence was gathered',
    };
  }

  if (!sample.reachable) {
    return { ...base, status: 'unreachable', score: 0, reason: 'gateway is unreachable' };
  }

  if (sample.latencyMs === undefined && sample.packetLossPercent === undefined) {
    return {
      ...base,
      status: 'unknown',
      score: 50,
      reason: 'reachable without quality measurements',
    };
  }

  const latencyScore =
    sample.latencyMs === undefined
      ? 100
      : sample.latencyMs <= policy.healthyLatencyMs
        ? 100
        : sample.latencyMs >= policy.degradedLatencyMs
          ? 0
          : (100 * (policy.degradedLatencyMs - sample.latencyMs)) /
            (policy.degradedLatencyMs - policy.healthyLatencyMs);
  const lossScore =
    sample.packetLossPercent === undefined
      ? 100
      : sample.packetLossPercent <= policy.healthyPacketLossPercent
        ? 100
        : sample.packetLossPercent >= policy.degradedPacketLossPercent
          ? 0
          : (100 * (policy.degradedPacketLossPercent - sample.packetLossPercent)) /
            (policy.degradedPacketLossPercent - policy.healthyPacketLossPercent);
  const score = clampScore((latencyScore + lossScore) / 2);

  if (evidence === 'transport') {
    // Transport reachability is real evidence, but it is not operational proof. The status is
    // capped so that a reachable transport can never be reported as a healthy gateway.
    return {
      ...base,
      status: MAX_STATUS_BY_EVIDENCE.transport,
      score: Math.min(score, 79),
      reason:
        'transport is reachable, but the tunnel protocol and external egress are not proven; ' +
        'the gateway is not operational',
    };
  }

  if (score >= 80)
    return {
      ...base,
      status: MAX_STATUS_BY_EVIDENCE[evidence],
      score,
      reason:
        evidence === 'egress'
          ? 'gateway is reachable with healthy quality and proven external egress'
          : 'gateway is reachable with healthy quality and a proven protocol exchange',
    };
  return {
    ...base,
    status: 'degraded',
    score,
    reason: 'gateway is reachable but quality is degraded',
  };
}

export async function probeGatewayHealth(
  gatewayId: GatewayId,
  endpoint: GatewayEndpoint,
  probe: GatewayHealthProbe,
  timeoutMs: number,
): Promise<GatewayHealthSample> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('timeoutMs must be a positive integer');

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      probe.probe(endpoint, timeoutMs),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('gateway health probe timed out')), timeoutMs);
      }),
    ]);

    return {
      gatewayId,
      checkedAt: new Date().toISOString(),
      reachable: result.reachable,
      // A probe that does not state what it proved proves transport at most.
      evidence: result.evidence ?? 'transport',
      ...(result.applicable === undefined ? {} : { applicable: result.applicable }),
      ...(result.latencyMs === undefined ? {} : { latencyMs: result.latencyMs }),
      ...(result.packetLossPercent === undefined
        ? {}
        : { packetLossPercent: result.packetLossPercent }),
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
