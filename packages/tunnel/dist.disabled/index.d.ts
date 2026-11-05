export interface TunnelEventBus {
    publish(event: {
        id: string;
        type: string;
        aggregateId: string;
        occurredAt: Date;
        payload: unknown;
        metadata?: Record<string, string>;
    }): Promise<void>;
}
export interface TunnelMetrics {
    record(name: string, value: number, labels?: Record<string, string>): void;
}
export type TunnelType = 'vpn' | 'proxy' | 'secure-tunnel' | 'local-tunnel' | 'remote-tunnel' | 'custom-transport';
export type TunnelProtocol = 'wireguard' | 'openvpn' | 'socks5' | 'http-connect' | 'https-proxy' | 'ssh' | 'quic' | 'custom';
export type AddressFamily = 'ipv4' | 'ipv6' | 'dual';
export type TunnelCapability = 'ipv4' | 'ipv6' | 'udp' | 'tcp' | 'dns' | 'splitRouting' | 'fullTunnel' | 'proxyOnly' | 'systemWide' | 'applicationScoped' | 'processScoped' | 'serviceScoped' | 'authentication' | 'keepalive' | 'reconnect' | 'healthCheck' | 'killSwitch' | 'MTUControl';
export type TunnelState = 'registered' | 'configured' | 'preparing' | 'connecting' | 'authenticating' | 'establishing' | 'connected' | 'degraded' | 'disconnecting' | 'disconnected' | 'failed' | 'recovering' | 'destroyed';
export type RoutingMode = 'fullTunnel' | 'splitTunnel' | 'proxyOnly' | 'custom';
export type TunnelScope = 'application' | 'process' | 'service' | 'system';
export type SecurityProfile = 'strict' | 'secure' | 'balanced' | 'compatibility';
export type AuthenticationType = 'none' | 'credentials' | 'certificate' | 'key' | 'token' | 'platform-identity';
export type DnsMode = 'insideTunnel' | 'outsideTunnel' | 'secureDnsIndependent' | 'resolverDecision';
export type LeakProtectionState = 'protected' | 'degraded' | 'leakDetected' | 'unknown';
export type ErrorClassification = 'retryable' | 'nonRetryable' | 'securityFailure' | 'policyFailure' | 'configurationFailure' | 'dependencyFailure' | 'resourceFailure';
export interface Endpoint {
    host: string;
    port: number;
    protocol: TunnelProtocol;
    addressFamily: AddressFamily;
    metadata: Record<string, unknown>;
}
export interface CredentialReference {
    credentialRef: string;
    type: Exclude<AuthenticationType, 'none'>;
}
export interface TunnelAuthentication {
    type: AuthenticationType;
    credentialRef?: string;
    certificateRef?: string;
    keyRef?: string;
    tokenRef?: string;
}
export interface KeepaliveConfig {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
}
export interface MtuConfig {
    configuredMtu?: number;
    detectedMtu?: number;
    effectiveMtu?: number;
    validationStatus: 'valid' | 'invalid' | 'unknown';
}
export interface SplitTunnelConfig {
    includedDestinations: string[];
    excludedDestinations: string[];
    precedence: 'include' | 'exclude';
    policyRef?: string;
}
export interface TunnelConfiguration {
    endpoint: Endpoint;
    routingMode: RoutingMode;
    scope: TunnelScope;
    dnsMode: DnsMode;
    authentication: TunnelAuthentication;
    securityProfile: SecurityProfile;
    capabilities: TunnelCapability[];
    keepalive: KeepaliveConfig;
    mtu: MtuConfig;
    timeoutMs: number;
    retryLimit: number;
    splitTunnel?: SplitTunnelConfig;
    credentialRef?: string;
    metadata?: Record<string, unknown>;
}
export interface TunnelHealth {
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    connectivity: boolean;
    handshake: boolean;
    latencyMs?: number;
    packetLoss?: number;
    throughputBps?: number;
    keepalive: boolean;
    routeReachable: boolean;
    dnsReachable: boolean;
    authenticated: boolean;
    checkedAt: string;
    leakProtection: LeakProtectionState;
}
export interface TunnelStatistics {
    bytesSent: number;
    bytesReceived: number;
    packetsSent: number;
    packetsReceived: number;
    handshakeCount: number;
    reconnectCount: number;
    uptimeMs: number;
    latencyMs?: number;
    packetLoss?: number;
    lastHandshake?: string;
}
export interface Tunnel {
    id: string;
    type: TunnelType;
    providerId: string;
    endpoint: Endpoint;
    state: TunnelState;
    capabilities: TunnelCapability[];
    securityProfile: SecurityProfile;
    configuration: TunnelConfiguration;
    health: TunnelHealth;
    metadata: Record<string, unknown>;
}
export interface Proxy {
    id: string;
    type: Extract<TunnelProtocol, 'socks5' | 'http-connect' | 'https-proxy'>;
    endpoint: Endpoint;
    authentication: TunnelAuthentication;
    capabilities: TunnelCapability[];
    state: TunnelState;
    health: TunnelHealth;
    metadata: Record<string, unknown>;
}
export interface TunnelConnection {
    id: string;
    tunnelId: string;
    state: TunnelState;
    establishedAt?: string;
    lastHealthCheck?: string;
    statistics: TunnelStatistics;
    routeContext?: unknown;
}
export interface TunnelPolicyConstraints {
    tunnelRequired?: boolean;
    proxyRequired?: boolean;
    vpnRequired?: boolean;
    approvedProviders?: string[];
    approvedProtocols?: TunnelProtocol[];
    allowedEndpoints?: string[];
    routingModes?: RoutingMode[];
    scopes?: TunnelScope[];
    killSwitchRequired?: boolean;
    dnsModes?: DnsMode[];
    requiredCapabilities?: TunnelCapability[];
}
export interface TunnelSelectionRequest {
    candidates: Tunnel[];
    policy: TunnelPolicyConstraints;
    routingMode: RoutingMode;
    scope: TunnelScope;
    requiredCapabilities: TunnelCapability[];
    securityProfile: SecurityProfile;
    routeContext?: unknown;
    connectivityContext?: unknown;
    dnsContext?: unknown;
}
export interface TunnelSelectionCandidate {
    tunnelId: string;
    eligible: boolean;
    rejectedReasons: string[];
    score: number;
    scoreComponents: Record<string, number>;
    explanation: string[];
}
export interface TunnelSelectionResult {
    candidates: TunnelSelectionCandidate[];
    rejectedCandidates: TunnelSelectionCandidate[];
    policyConstraints: TunnelPolicyConstraints;
    selectedTunnel?: Tunnel | undefined;
    reason: string;
}
export interface ProviderHealth {
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    checkedAt: string;
    latencyMs?: number;
}
export interface TunnelProvider {
    readonly id: string;
    readonly type: TunnelType;
    readonly protocol: TunnelProtocol;
    readonly capabilities: TunnelCapability[];
    readonly endpoints: Endpoint[];
    readonly supportedScopes: TunnelScope[];
    readonly supportedRoutingModes: RoutingMode[];
    healthCheck(tunnel?: Tunnel): Promise<TunnelHealth | ProviderHealth>;
    create(config: TunnelConfiguration): Promise<Tunnel>;
    connect(tunnel: Tunnel): Promise<TunnelConnection>;
    disconnect(connection: TunnelConnection, timeoutMs: number): Promise<void>;
    destroy(tunnel: Tunnel): Promise<void>;
}
export interface PlatformTunnelAdapter {
    readonly platform: 'linux' | 'windows' | 'macos' | 'unknown';
    prepare(tunnel: Tunnel): Promise<void>;
    establish(tunnel: Tunnel): Promise<void>;
    cleanup(tunnel: Tunnel): Promise<void>;
    validateRouteContext(tunnel: Tunnel, routeContext?: unknown): Promise<boolean>;
}
export interface KillSwitch {
    enable(tunnelId: string): Promise<void>;
    disable(tunnelId: string): Promise<void>;
    status(tunnelId: string): Promise<'enabled' | 'disabled' | 'unsupported' | 'unknown'>;
}
export interface RecoveryTunnelActions {
    reconnectTunnel(tunnelId: string): Promise<TunnelConnection>;
    switchEndpoint(tunnelId: string, endpoint: Endpoint): Promise<TunnelConnection>;
    switchTunnel(fromTunnelId: string, toTunnelId: string): Promise<TunnelConnection>;
    switchProxy(fromProxyId: string, toProxyId: string): Promise<TunnelConnection>;
    disconnectTunnel(tunnelId: string): Promise<void>;
    revalidateTunnel(tunnelId: string): Promise<TunnelHealth>;
}
export declare class TunnelError extends Error {
    readonly code: string;
    readonly classification: ErrorClassification;
    readonly retryable: boolean;
    readonly details: Record<string, unknown>;
    constructor(message: string, code: string, classification: ErrorClassification, retryable?: boolean, details?: Record<string, unknown>);
}
export declare const tunnelErrors: {
    configuration: (m: string, d?: Record<string, unknown>) => TunnelError;
    unsupported: (m: string, d?: Record<string, unknown>) => TunnelError;
    auth: (m: string, d?: Record<string, unknown>) => TunnelError;
    state: (m: string, d?: Record<string, unknown>) => TunnelError;
    policy: (m: string, d?: Record<string, unknown>) => TunnelError;
    capability: (m: string, d?: Record<string, unknown>) => TunnelError;
    resource: (m: string, d?: Record<string, unknown>) => TunnelError;
    dependency: (m: string, d?: Record<string, unknown>) => TunnelError;
};
export declare function transitionTunnel(tunnel: Tunnel, next: TunnelState): Tunnel;
export declare function validateEndpoint(endpoint: Endpoint): void;
export declare function validateTunnelConfiguration(config: TunnelConfiguration): void;
export declare function redacted(value: unknown): unknown;
export declare class TunnelProviderRegistry {
    private readonly maxProviders;
    private providers;
    constructor(maxProviders?: number);
    register(provider: TunnelProvider): void;
    get(providerId: string): TunnelProvider | undefined;
    list(): TunnelProvider[];
    findByCapabilities(required: TunnelCapability[]): TunnelProvider[];
    unregister(providerId: string): void;
}
export declare class TunnelSelector {
    select(request: TunnelSelectionRequest): TunnelSelectionResult;
    private score;
}
export declare class NoopLinuxTunnelAdapter implements PlatformTunnelAdapter {
    readonly platform: "linux";
    prepare(): Promise<void>;
    establish(): Promise<void>;
    cleanup(): Promise<void>;
    validateRouteContext(): Promise<boolean>;
}
export declare class UnsupportedProtocolProvider implements TunnelProvider {
    readonly id: string;
    readonly type: TunnelType;
    readonly protocol: TunnelProtocol;
    readonly capabilities: TunnelCapability[];
    readonly endpoints: Endpoint[];
    readonly supportedScopes: TunnelScope[];
    readonly supportedRoutingModes: RoutingMode[];
    constructor(id: string, type: TunnelType, protocol: TunnelProtocol, capabilities?: TunnelCapability[], endpoints?: Endpoint[]);
    healthCheck(): Promise<ProviderHealth>;
    create(): Promise<Tunnel>;
    connect(): Promise<TunnelConnection>;
    disconnect(_connection: TunnelConnection, _timeoutMs: number): Promise<void>;
    destroy(): Promise<void>;
}
export declare class TunnelManager implements RecoveryTunnelActions {
    private readonly registry;
    private readonly events?;
    private readonly metrics?;
    private readonly limits;
    private tunnels;
    private connections;
    private locks;
    private shuttingDown;
    constructor(registry: TunnelProviderRegistry, events?: TunnelEventBus | undefined, metrics?: TunnelMetrics | undefined, limits?: {
        maxTunnels: number;
        maxConcurrentConnects: number;
    });
    configure(providerId: string, config: TunnelConfiguration): Promise<Tunnel>;
    getTunnel(tunnelId: string): Tunnel | undefined;
    connect(tunnelId: string): Promise<TunnelConnection>;
    disconnectTunnel(tunnelId: string): Promise<void>;
    reconnectTunnel(tunnelId: string): Promise<TunnelConnection>;
    switchEndpoint(tunnelId: string, endpoint: Endpoint): Promise<TunnelConnection>;
    switchTunnel(_fromTunnelId: string, toTunnelId: string): Promise<TunnelConnection>;
    switchProxy(_fromProxyId: string, toProxyId: string): Promise<TunnelConnection>;
    revalidateTunnel(tunnelId: string): Promise<TunnelHealth>;
    shutdown(): Promise<void>;
    private mustTunnel;
    private mustProvider;
    private publish;
}
export declare function simulateTunnelSelection(request: TunnelSelectionRequest): TunnelSelectionResult;
export declare function simulateTunnelConnection(tunnel: Tunnel): Record<string, unknown>;
export declare function simulateFailover(from: Tunnel, candidates: Tunnel[], policy: TunnelPolicyConstraints): TunnelSelectionResult;
export declare const supportedProtocolStatus: Record<'WireGuard' | 'OpenVPN' | 'SOCKS5' | 'HTTP CONNECT' | 'HTTPS proxy', 'implemented' | 'not implemented'>;
export * from './wireguard.js';
export * from './lifecycle.js';
export * from './kill-switch.js';
//# sourceMappingURL=index.d.ts.map