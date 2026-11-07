import type { ConnectivityCapability, ConnectivityHealth, ConnectivityOperationResult, ConnectivityProvider, ConnectivityResource, ConnectivityState } from './index.js';
export type StarlinkGatewayProtocol = 'wireguard' | 'openvpn' | 'vless' | 'vmess' | 'reality' | 'shadowsocks' | 'trojan' | 'socks5' | 'zerotier' | 'l2tp' | 'sstp' | 'ikev2' | 'pptp' | 'ssh' | 'http-proxy';
export type StarlinkGatewaySource = 'starlink-reverse-egress' | 'javidnet' | 'javid-mask' | 'getastatic' | 'egret' | 'nasnet-connect' | 'starlinux-pi-starlink' | 'gbrandt-pi-starlink' | 'raspberry-gateway' | 'realink-setalink';
export interface StarlinkGatewayProfile {
    id: string;
    name: string;
    source: StarlinkGatewaySource;
    protocol: StarlinkGatewayProtocol;
    endpoint: string;
    enabled?: boolean;
    priority?: number;
    tags?: string[];
    metadata?: Record<string, unknown>;
}
export interface StarlinkGatewayProbe {
    probe(profile: StarlinkGatewayProfile): Promise<ConnectivityHealth>;
}
/**
 * Adapts externally managed Starlink egress gateways into the normal
 * ConnectivityProvider/ConnectivityManager pipeline.
 *
 * The adapter deliberately does not contain credentials, public endpoints,
 * or provider-specific configuration. Operators supply a reachable gateway
 * endpoint through their own configuration/secret management and implement
 * the probe/activation boundary appropriate to their tunnel runtime.
 */
export declare class ExternalStarlinkGatewayProvider implements ConnectivityProvider {
    readonly id = "starlink-external-gateways";
    readonly type: "custom";
    private readonly profiles;
    private readonly probeGateway;
    constructor(profiles: readonly StarlinkGatewayProfile[], probeGateway: StarlinkGatewayProbe);
    capabilities(): ConnectivityCapability[];
    discover(): Promise<ConnectivityResource[]>;
    getState(resourceId?: string): Promise<ConnectivityState>;
    getHealth(resourceId?: string): Promise<ConnectivityHealth>;
    connect(resourceId: string): Promise<ConnectivityOperationResult>;
    disconnect(resourceId: string): Promise<ConnectivityOperationResult>;
    activate(resourceId: string): Promise<ConnectivityOperationResult>;
    deactivate(resourceId: string): Promise<ConnectivityOperationResult>;
    private toResource;
    private requireProfile;
    private validateProfiles;
}
export declare function createStarlinkGatewayHealthProbe(probe: (profile: StarlinkGatewayProfile) => Promise<ConnectivityHealth>): StarlinkGatewayProbe;
//# sourceMappingURL=starlink-gateway.d.ts.map