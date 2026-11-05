import type { Endpoint, RoutingMode, Tunnel, TunnelCapability, TunnelConfiguration, TunnelConnection, TunnelHealth, TunnelProvider, TunnelScope, TunnelType } from './index.js';
export interface OpenVPNCommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface OpenVPNCommandRunner {
    run(command: string, args: string[], options?: {
        timeoutMs?: number;
    }): Promise<OpenVPNCommandResult>;
}
export declare class NodeOpenVPNCommandRunner implements OpenVPNCommandRunner {
    run(command: string, args: string[], options?: {
        timeoutMs?: number;
    }): Promise<OpenVPNCommandResult>;
}
export interface OpenVPNCredentialStore {
    getClientConfig(credentialRef: string): Promise<string>;
}
export interface OpenVPNProviderOptions {
    credentialStore: OpenVPNCredentialStore;
    commandRunner?: OpenVPNCommandRunner;
    commandTimeoutMs?: number;
    startupTimeoutMs?: number;
    pollIntervalMs?: number;
    tunnelType?: TunnelType;
}
export declare class OpenVPNProvider implements TunnelProvider {
    readonly id = "openvpn";
    readonly type: TunnelType;
    readonly protocol: "openvpn";
    readonly endpoints: Endpoint[];
    readonly supportedScopes: TunnelScope[];
    readonly supportedRoutingModes: RoutingMode[];
    readonly capabilities: TunnelCapability[];
    private readonly commandRunner;
    private readonly credentialStore;
    private readonly commandTimeoutMs;
    private readonly startupTimeoutMs;
    private readonly pollIntervalMs;
    private readonly tunnelType;
    private readonly runtime;
    constructor(options: OpenVPNProviderOptions);
    capabilitiesInfo(): {
        protocols: string[];
        transports: string[];
        addressFamilies: string[];
        supportsReconnect: boolean;
        supportsHealthCheck: boolean;
    };
    create(config: TunnelConfiguration): Promise<Tunnel>;
    connect(tunnel: Tunnel): Promise<TunnelConnection>;
    disconnect(connection: TunnelConnection, timeoutMs: number): Promise<void>;
    destroy(tunnel: Tunnel): Promise<void>;
    healthCheck(tunnel?: Tunnel): Promise<TunnelHealth>;
    private waitForHealthy;
    private waitForPid;
    private stopRuntime;
    private assertTunnel;
}
//# sourceMappingURL=openvpn.d.ts.map