export type WindowsNetworkSnapshot = {
    interfaces: string;
    routes: string;
    dns: string;
    capturedAt: string;
    platform: 'win32' | 'unsupported';
};
export type WindowsClientPolicy = {
    autonomousMode: boolean;
};
export interface WindowsSystemAdapter {
    snapshot(): Promise<WindowsNetworkSnapshot>;
    setAutonomousMode(enabled: boolean): Promise<void>;
}
export declare class WindowsSystem implements WindowsSystemAdapter {
    private policy;
    snapshot(): Promise<WindowsNetworkSnapshot>;
    setAutonomousMode(enabled: boolean): Promise<void>;
    getPolicy(): WindowsClientPolicy;
}
