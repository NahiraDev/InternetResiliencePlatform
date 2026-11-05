export type StarlinkResourceId = 'starlink-reverse-egress' | 'javidnet' | 'javid-mask' | 'getastatic' | 'egret' | 'nasnet-connect' | 'starlinux-pi-starlink' | 'gbrandt-pi-starlink' | 'raspberry-gateway' | 'realink-setalink' | 'starlink-vpn-compatibility';
export type StarlinkResourceKind = 'architecture' | 'self-hosted' | 'service' | 'software' | 'documentation';
export type StarlinkResourceLifecycle = 'active' | 'needs-verification' | 'unverified';
export type StarlinkTunnelProtocol = 'wireguard' | 'openvpn' | 'vless' | 'vmess' | 'reality' | 'shadowsocks' | 'trojan' | 'socks5' | 'zerotier' | 'l2tp' | 'sstp' | 'ikev2' | 'pptp' | 'ssh' | 'http-proxy';
export type StarlinkResourceCapability = 'reverse-egress' | 'public-ip' | 'inbound-access' | 'outbound-egress' | 'vpn-gateway' | 'proxy-gateway' | 'mesh' | 'split-tunneling' | 'failover' | 'load-balancing' | 'ipv6' | 'ddns' | 'remote-access' | 'mikrotik' | 'router-gateway' | 'cgnat-compatible';
export interface StarlinkResourceSource {
    url: string;
    kind: 'github' | 'official-service' | 'official-docs' | 'project-site';
    verifiedAt: string;
}
export interface StarlinkResource {
    id: StarlinkResourceId;
    name: string;
    kind: StarlinkResourceKind;
    lifecycle: StarlinkResourceLifecycle;
    description: string;
    protocols: StarlinkTunnelProtocol[];
    capabilities: StarlinkResourceCapability[];
    freeTier: boolean;
    publicEndpointProvided: boolean;
    requiresUserOwnedStarlink: boolean;
    sources: StarlinkResourceSource[];
    notes: string[];
}
export declare const STARLINK_RESOURCES: readonly StarlinkResource[];
export declare function getStarlinkResource(id: StarlinkResourceId): StarlinkResource | undefined;
export interface StarlinkResourceQuery {
    protocol?: StarlinkTunnelProtocol;
    capability?: StarlinkResourceCapability;
    freeOnly?: boolean;
    publicEndpointOnly?: boolean;
    lifecycle?: StarlinkResourceLifecycle | StarlinkResourceLifecycle[];
    requiresUserOwnedStarlink?: boolean;
}
export declare function listStarlinkResources(query?: StarlinkResourceQuery): StarlinkResource[];
//# sourceMappingURL=starlink-resources.d.ts.map