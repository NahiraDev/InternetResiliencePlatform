export type MobilePlatform = 'ios' | 'android';
export type MobileConnectionState = 'unknown' | 'online' | 'degraded' | 'offline';
export type MobileNetworkSnapshot = {
    platform: MobilePlatform;
    connection: MobileConnectionState;
    interfaceCount: number;
    defaultRouteAvailable: boolean;
    dnsReachable: boolean;
    capturedAt: string;
};
export type MobileClientPolicy = {
    autonomousMode: boolean;
};
export type MobileClientState = {
    platform: MobilePlatform;
    connection: MobileConnectionState;
    policy: MobileClientPolicy;
    revision: number;
};
export interface MobileDiagnosticsAdapter {
    snapshot(): Promise<MobileNetworkSnapshot>;
}
export type MobileClientEvent = {
    type: 'snapshot';
    state: MobileClientState;
    snapshot: MobileNetworkSnapshot;
} | {
    type: 'policy-changed';
    state: MobileClientState;
} | {
    type: 'connection-changed';
    state: MobileClientState;
};
export type MobileClientListener = (event: MobileClientEvent) => void;
export declare const createMobileClientState: (platform: string) => MobileClientState;
export declare class MobileClientCore {
    private state;
    private readonly listeners;
    constructor(platform: string);
    getState(): MobileClientState;
    subscribe(listener: MobileClientListener): () => void;
    setAutonomousMode(enabled: boolean): void;
    refresh(adapter: MobileDiagnosticsAdapter): Promise<MobileNetworkSnapshot>;
    private emit;
}
//# sourceMappingURL=mobile-client.d.ts.map