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
export declare class EndpointRegistry {
    private readonly endpoints;
    private readonly observations;
    private readonly maxObservations;
    private readonly now;
    constructor(options?: EndpointRegistryOptions);
    register(definition: EndpointDefinition): EndpointRecord;
    observe(observation: EndpointObservation): EndpointHealth;
    get(id: string): EndpointRecord | undefined;
    list(filter?: {
        status?: EndpointStatus;
        region?: string;
        protocol?: EndpointProtocol;
    }): EndpointRecord[];
    rank(options?: {
        region?: string;
        protocol?: EndpointProtocol;
        limit?: number;
    }): EndpointRecord[];
    retire(id: string): boolean;
    size(): number;
    private clone;
}
export declare const scoreEndpoint: (health: EndpointHealth) => number;
//# sourceMappingURL=endpoint-registry.d.ts.map