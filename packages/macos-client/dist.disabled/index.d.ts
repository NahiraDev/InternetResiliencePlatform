import type { AddressInfo } from 'node:net';
export type MacOSNetworkSnapshot = {
    interfaces: string;
    routes: string;
    dns: string;
    networkServices: string;
    vpnServices: string;
    capturedAt: string;
    platform: 'darwin' | 'unsupported';
};
export type MacOSClientPolicy = {
    autonomousMode: boolean;
    preferredInterface?: string;
};
export interface MacOSSystemAdapter {
    snapshot(): Promise<MacOSNetworkSnapshot>;
    setAutonomousMode(enabled: boolean): Promise<void>;
}
export declare class MacOSSystem implements MacOSSystemAdapter {
    private policy;
    snapshot(): Promise<MacOSNetworkSnapshot>;
    setAutonomousMode(enabled: boolean): Promise<void>;
    getPolicy(): MacOSClientPolicy;
}
export declare class MacOSClientServer {
    private readonly system;
    private readonly controlToken?;
    private readonly server;
    private port;
    /** Without `controlToken`, `POST /policy` is disabled (fail-closed). */
    constructor(system: MacOSSystem, controlToken?: string | undefined);
    start(port?: number, host?: string): Promise<void>;
    address(): string | AddressInfo | null;
    stop(): Promise<void>;
    private refuse;
    private handle;
}
export declare function runMacOSClient(): Promise<MacOSClientServer>;
