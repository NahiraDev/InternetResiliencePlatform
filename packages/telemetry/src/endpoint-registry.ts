export type EndpointProtocol = 'dns' | 'http' | 'https' | 'tcp' | 'tls' | 'icmp';
export type EndpointStatus = 'new' | 'probing' | 'healthy' | 'degraded' | 'unreliable' | 'retired';

export interface EndpointDefinition {
  id: string;
  hostname?: string;
  address: string;
  port?: number;
  protocol: EndpointProtocol;
  region?: string;
  provider?: string;
  asn?: string;
  tags?: readonly string[];
}

export interface EndpointObservation {
  endpointId: string;
  observedAt: string;
  available: boolean;
  latencyMs?: number;
  packetLossPercent?: number;
  dnsSuccess?: boolean;
  tlsSuccess?: boolean;
  httpStatus?: number;
}

export interface EndpointHealth {
  endpointId: string;
  status: EndpointStatus;
  reliabilityScore: number;
  latencyScore: number;
  availabilityScore: number;
  confidence: number;
  sampleCount: number;
  lastObservedAt?: string;
}

export interface EndpointRecord extends EndpointDefinition {
  status: EndpointStatus;
  firstSeen: string;
  lastSeen: string;
  health: EndpointHealth;
}

export interface EndpointRegistryOptions {
  maxObservationsPerEndpoint?: number;
  now?: () => Date;
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value));

const observationScore = (observation: EndpointObservation): number => {
  const availability = observation.available ? 100 : 0;
  const latency =
    observation.latencyMs === undefined
      ? 50
      : clamp(100 - Math.max(0, observation.latencyMs - 50) / 5);
  const loss =
    observation.packetLossPercent === undefined
      ? 100
      : clamp(100 - Math.max(0, observation.packetLossPercent));
  return availability * 0.5 + latency * 0.25 + loss * 0.25;
};

const validateObservation = (observation: EndpointObservation): void => {
  if (!observation.endpointId) throw new Error('endpointId is required');
  if (!observation.observedAt || Number.isNaN(Date.parse(observation.observedAt)))
    throw new Error('observedAt must be a valid ISO timestamp');
  if (
    observation.latencyMs !== undefined &&
    (!Number.isFinite(observation.latencyMs) || observation.latencyMs < 0)
  )
    throw new Error('latencyMs must be a non-negative finite number');
  if (
    observation.packetLossPercent !== undefined &&
    (!Number.isFinite(observation.packetLossPercent) ||
      observation.packetLossPercent < 0 ||
      observation.packetLossPercent > 100)
  )
    throw new Error('packetLossPercent must be between 0 and 100');
};

export class EndpointRegistry {
  private readonly endpoints = new Map<string, EndpointRecord>();
  private readonly observations = new Map<string, EndpointObservation[]>();
  private readonly maxObservations: number;
  private readonly now: () => Date;

  constructor(options: EndpointRegistryOptions = {}) {
    this.maxObservations = Math.max(1, Math.floor(options.maxObservationsPerEndpoint ?? 100));
    this.now = options.now ?? (() => new Date());
  }

  register(definition: EndpointDefinition): EndpointRecord {
    if (!definition.id) throw new Error('endpoint id is required');
    if (!definition.address) throw new Error('endpoint address is required');
    if (definition.port !== undefined && (definition.port < 1 || definition.port > 65535))
      throw new Error('port must be between 1 and 65535');

    const existing = this.endpoints.get(definition.id);
    const timestamp = this.now().toISOString();
    if (existing) {
      const updated: EndpointRecord = {
        ...existing,
        ...definition,
        firstSeen: existing.firstSeen,
        lastSeen: timestamp,
        health: { ...existing.health, endpointId: definition.id },
      };
      this.endpoints.set(definition.id, updated);
      return this.clone(updated);
    }

    const health: EndpointHealth = {
      endpointId: definition.id,
      status: 'new',
      reliabilityScore: 0,
      latencyScore: 0,
      availabilityScore: 0,
      confidence: 0,
      sampleCount: 0,
    };
    const record: EndpointRecord = {
      ...definition,
      status: 'new',
      firstSeen: timestamp,
      lastSeen: timestamp,
      health,
    };
    this.endpoints.set(definition.id, record);
    return this.clone(record);
  }

  observe(observation: EndpointObservation): EndpointHealth {
    validateObservation(observation);
    const endpoint = this.endpoints.get(observation.endpointId);
    if (!endpoint) throw new Error(`unknown endpoint: ${observation.endpointId}`);

    const history = this.observations.get(observation.endpointId) ?? [];
    history.push({ ...observation });
    while (history.length > this.maxObservations) history.shift();
    this.observations.set(observation.endpointId, history);

    const availabilityScore =
      (history.filter((item) => item.available).length / history.length) * 100;
    const latencySamples = history.filter((item) => item.latencyMs !== undefined);
    const latencyScore = latencySamples.length
      ? latencySamples.reduce((sum, item) => sum + observationScore(item), 0) /
        latencySamples.length
      : availabilityScore;
    const reliabilityScore =
      history.reduce((sum, item) => sum + observationScore(item), 0) / history.length;
    const confidence = clamp((history.length / 10) * 100);
    const status: EndpointStatus =
      reliabilityScore >= 90 && availabilityScore >= 99
        ? 'healthy'
        : reliabilityScore >= 70 && availabilityScore >= 95
          ? 'degraded'
          : reliabilityScore >= 40
            ? 'unreliable'
            : 'retired';

    endpoint.status = status;
    endpoint.lastSeen = observation.observedAt;
    endpoint.health = {
      endpointId: endpoint.id,
      status,
      reliabilityScore: Number(reliabilityScore.toFixed(2)),
      latencyScore: Number(clamp(latencyScore).toFixed(2)),
      availabilityScore: Number(availabilityScore.toFixed(2)),
      confidence: Number(confidence.toFixed(2)),
      sampleCount: history.length,
      lastObservedAt: observation.observedAt,
    };
    return { ...endpoint.health };
  }

  get(id: string): EndpointRecord | undefined {
    const endpoint = this.endpoints.get(id);
    return endpoint ? this.clone(endpoint) : undefined;
  }

  list(filter?: {
    status?: EndpointStatus;
    region?: string;
    protocol?: EndpointProtocol;
  }): EndpointRecord[] {
    return [...this.endpoints.values()]
      .filter((endpoint) => !filter?.status || endpoint.status === filter.status)
      .filter((endpoint) => !filter?.region || endpoint.region === filter.region)
      .filter((endpoint) => !filter?.protocol || endpoint.protocol === filter.protocol)
      .map((endpoint) => this.clone(endpoint));
  }

  rank(options: {
    region?: string;
    protocol?: EndpointProtocol;
    limit?: number;
  } = {}): EndpointRecord[] {
    const limit = Math.max(1, Math.floor(options.limit ?? 20));
    return this.list(options)
      .filter((endpoint) => endpoint.status !== 'retired')
      .sort((a, b) => scoreEndpoint(b.health) - scoreEndpoint(a.health))
      .slice(0, limit);
  }

  retire(id: string): boolean {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) return false;
    endpoint.status = 'retired';
    endpoint.health = { ...endpoint.health, status: 'retired' };
    endpoint.lastSeen = this.now().toISOString();
    return true;
  }

  size(): number {
    return this.endpoints.size;
  }

  private clone(endpoint: EndpointRecord): EndpointRecord {
    return {
      ...endpoint,
      tags: endpoint.tags ? [...endpoint.tags] : undefined,
      health: { ...endpoint.health },
    };
  }
}

export const scoreEndpoint = (health: EndpointHealth): number =>
  Number(
    clamp(
      health.reliabilityScore * 0.5 +
        health.availabilityScore * 0.35 +
        health.confidence * 0.15,
    ).toFixed(2),
  );
