export type GatewayId = string;
export type GatewayLifecycle = 'registered' | 'active' | 'draining' | 'disabled' | 'retired';
export type GatewayTrust = 'untrusted' | 'pending' | 'trusted' | 'revoked';
export type GatewayAddressFamily = 'ipv4' | 'ipv6' | 'dual';
export interface GatewayEndpoint {
    host: string;
    port: number;
    family: GatewayAddressFamily;
}
export interface GatewayCapabilities {
    tunnelProtocols: string[];
    addressFamilies: GatewayAddressFamily[];
    transports: string[];
    features: string[];
}
/**
 * How traffic is tunnelled to a gateway.
 *
 * The declaration travels with the gateway record so that the trust decision covers the tunnel
 * parameters as well: a gateway is not usable unless its endpoint, its protocol and its
 * credential reference are all known and the record itself is trusted.
 *
 * `credentialRef` is a reference to a credential held by the host (for example a systemd
 * `LoadCredential` name), never the credential material itself and never a placeholder.
 */
export interface GatewayTunnelDeclaration {
    /** The tunnel protocol, for example `wireguard`. Must be supported by the host provider. */
    readonly protocol: string;
    /** Reference to the host-held credential that authenticates the tunnel. */
    readonly credentialRef: string;
    readonly routingMode: 'fullTunnel' | 'splitTunnel';
    /** Address assigned to the tunnel interface, in CIDR form. */
    readonly addressCidr?: string;
    /** Destinations routed through the tunnel (split tunnel). */
    readonly allowedDestinations?: readonly string[];
    /** Destinations excluded from the tunnel (split tunnel). */
    readonly excludedDestinations?: readonly string[];
    /** Host interface name of the tunnel device, when the host controls it. */
    readonly interfaceName?: string;
    readonly mtu?: number;
    readonly keepaliveSeconds?: number;
}
export interface GatewayOwnership {
    ownerId: string;
    organizationId?: string;
    managedBy: 'local' | 'control-plane' | 'provider';
}
export interface GatewayMetadata {
    id: GatewayId;
    name: string;
    description?: string;
    region?: string;
    countryCode?: string;
    providerId?: string;
    endpoint: GatewayEndpoint;
    ownership: GatewayOwnership;
    capabilities: GatewayCapabilities;
    /** How traffic reaches this gateway through a tunnel, when the gateway is tunnel-addressable. */
    tunnel?: GatewayTunnelDeclaration;
    lifecycle: GatewayLifecycle;
    trust: GatewayTrust;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    lastHealthCheckAt?: string;
    retiredAt?: string;
}
export interface GatewayPatch {
    name?: string;
    description?: string;
    region?: string;
    countryCode?: string;
    providerId?: string;
    endpoint?: GatewayEndpoint;
    ownership?: GatewayOwnership;
    capabilities?: GatewayCapabilities;
    tunnel?: GatewayTunnelDeclaration;
    tags?: string[];
}
export interface GatewayRegistry {
    register(gateway: GatewayMetadata): GatewayMetadata;
    get(id: GatewayId): GatewayMetadata | undefined;
    list(filter?: GatewayFilter): GatewayMetadata[];
    update(id: GatewayId, patch: GatewayPatch): GatewayMetadata;
    transition(id: GatewayId, lifecycle: GatewayLifecycle): GatewayMetadata;
    setTrust(id: GatewayId, trust: GatewayTrust): GatewayMetadata;
    remove(id: GatewayId): GatewayMetadata;
}
export interface GatewayFilter {
    lifecycle?: GatewayLifecycle | GatewayLifecycle[];
    trust?: GatewayTrust | GatewayTrust[];
    region?: string;
    countryCode?: string;
    providerId?: string;
    ownerId?: string;
    tag?: string;
}
/**
 * Validates a tunnel declaration.
 *
 * A declaration without a protocol or without a credential reference is rejected: the gateway
 * plane must fail closed rather than invent a protocol or fall back to a placeholder credential.
 */
export declare function assertTunnelDeclaration(declaration: GatewayTunnelDeclaration): void;
export declare class InMemoryGatewayRegistry implements GatewayRegistry {
    private readonly gateways;
    register(input: GatewayMetadata): GatewayMetadata;
    get(id: GatewayId): GatewayMetadata | undefined;
    list(filter?: GatewayFilter): GatewayMetadata[];
    update(id: GatewayId, patch: GatewayPatch): GatewayMetadata;
    transition(id: GatewayId, lifecycle: GatewayLifecycle): GatewayMetadata;
    setTrust(id: GatewayId, trust: GatewayTrust): GatewayMetadata;
    remove(id: GatewayId): GatewayMetadata;
    private require;
}
export * from './health.js';
export * from './discovery.js';
export * from './selection.js';
export * from './failover.js';
export * from './fleet.js';
export * from './security.js';
export * from './starlink-resources.js';
export * from './probe.js';
export * from './capacity-contracts.js';
export * from './shared-infrastructure-adapter.js';
export type { GatewayProbeResult } from './health.js';
//# sourceMappingURL=index.d.ts.map