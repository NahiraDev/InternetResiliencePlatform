import type { Endpoint, Tunnel, TunnelCapability, TunnelConfiguration, TunnelConnection, TunnelHealth, TunnelProvider, TunnelType, RoutingMode } from './index.js';
export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface CommandRunner {
    run(command: string, args: string[], options?: {
        stdin?: string;
        timeoutMs?: number;
    }): Promise<CommandResult>;
}
export declare class NodeCommandRunner implements CommandRunner {
    run(command: string, args: string[], options?: {
        stdin?: string;
        timeoutMs?: number;
    }): Promise<CommandResult>;
}
export interface WireGuardCredentialStore {
    getPrivateKey(credentialRef: string): Promise<string>;
}
export interface WireGuardKeyPair {
    privateKey: string;
    publicKey: string;
}
export interface WireGuardPeerConfig {
    publicKey: string;
    allowedIPs: string[];
    endpoint?: string;
    persistentKeepalive?: number;
}
export interface WireGuardProviderOptions {
    commandRunner?: CommandRunner;
    credentialStore: WireGuardCredentialStore;
    interfaceName?: string;
    commandTimeoutMs?: number;
    handshakeMaxAgeMs?: number;
    startupTimeoutMs?: number;
    pollIntervalMs?: number;
    addressCidr?: string;
    peer: WireGuardPeerConfig;
    tunnelType?: TunnelType;
}
export declare class WireGuardProvider implements TunnelProvider {
    readonly id = "wireguard";
    readonly type: TunnelType;
    readonly protocol: "wireguard";
    readonly endpoints: Endpoint[];
    readonly supportedScopes: "system"[];
    readonly supportedRoutingModes: RoutingMode[];
    readonly capabilities: TunnelCapability[];
    private readonly commandRunner;
    private readonly credentialStore;
    private readonly interfaceName;
    private readonly commandTimeoutMs;
    private readonly handshakeMaxAgeMs;
    private readonly startupTimeoutMs;
    private readonly pollIntervalMs;
    private readonly addressCidr;
    private readonly peer;
    private readonly tunnelType;
    private readonly runtime;
    constructor(options: WireGuardProviderOptions);
    capabilitiesInfo(): {
        protocols: string[];
        transports: string[];
        addressFamilies: string[];
        supportsReconnect: boolean;
        supportsHealthCheck: boolean;
    };
    create(config: TunnelConfiguration): Promise<Tunnel>;
    connect(tunnel: Tunnel): Promise<TunnelConnection>;
    disconnect(connection: TunnelConnection, _timeoutMs: number): Promise<void>;
    destroy(tunnel: Tunnel): Promise<void>;
    healthCheck(tunnel?: Tunnel): Promise<TunnelHealth>;
    static generateKeyPair(commandRunner?: CommandRunner): Promise<WireGuardKeyPair>;
    private loadPrivateKey;
    private ensureInterface;
    private runWgSet;
    private runIp;
    private createPrivateKeyFile;
    private waitForHealthy;
    private assertTunnel;
}
//# sourceMappingURL=wireguard.d.ts.map