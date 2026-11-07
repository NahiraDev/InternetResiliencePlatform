import type { ConnectivityCapability, ConnectivityHealth, ConnectivityOperationResult, ConnectivityProvider, ConnectivityResource, ConnectivityState } from './index.js';
export interface StarlinkCommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface StarlinkCommandRunner {
    run(command: string, args: string[], options?: {
        timeoutMs?: number;
    }): Promise<StarlinkCommandResult>;
}
export interface StarlinkProviderOptions {
    commandRunner?: StarlinkCommandRunner;
    target?: string;
    grpcurlCommand?: string;
    resourceId?: string;
    timeoutMs?: number;
    minimumHealthyScore?: number;
}
export interface StarlinkStatusSnapshot {
    state?: string;
    latencyMs?: number;
    packetLoss?: number;
    downloadMbps?: number;
    uploadMbps?: number;
    obstructionPercent?: number;
    uptimeSeconds?: number;
    raw: Record<string, unknown>;
}
export declare class NodeStarlinkCommandRunner implements StarlinkCommandRunner {
    run(command: string, args: string[], options?: {
        timeoutMs?: number;
    }): Promise<StarlinkCommandResult>;
}
export declare class StarlinkDishClient {
    private readonly target;
    private readonly grpcurlCommand;
    private readonly timeoutMs;
    constructor(options?: StarlinkProviderOptions);
    probe(): Promise<boolean>;
    getStatus(runner: StarlinkCommandRunner): Promise<StarlinkStatusSnapshot | undefined>;
}
export declare class StarlinkProvider implements ConnectivityProvider {
    readonly id = "starlink";
    readonly type: "custom";
    private readonly client;
    private readonly commandRunner;
    private readonly resourceId;
    private readonly minimumHealthyScore;
    private lastStatus;
    constructor(options?: StarlinkProviderOptions);
    capabilities(): ConnectivityCapability[];
    discover(): Promise<ConnectivityResource[]>;
    getState(resourceId?: string): Promise<ConnectivityState>;
    getHealth(resourceId?: string): Promise<ConnectivityHealth>;
    connect(resourceId: string): Promise<ConnectivityOperationResult>;
    disconnect(resourceId: string): Promise<ConnectivityOperationResult>;
    activate(resourceId: string): Promise<ConnectivityOperationResult>;
    deactivate(resourceId: string): Promise<ConnectivityOperationResult>;
    getLastStatus(): StarlinkStatusSnapshot | undefined;
    private assertResource;
}
//# sourceMappingURL=starlink.d.ts.map