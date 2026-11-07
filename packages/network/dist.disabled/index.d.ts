export type ProbeType = 'dns' | 'tcp' | 'http' | 'packet_loss' | 'stability' | 'throughput' | 'ip' | 'provider';
export interface NetworkInterfaceInfo {
    name: string;
    address: string;
    family: 'IPv4' | 'IPv6';
    internal: boolean;
}
export interface ProbeResult<T = Record<string, unknown>> {
    probeType: ProbeType;
    name: string;
    success: boolean;
    latencyMs: number;
    timestamp: string;
    error?: string;
    metadata: T;
}
export interface ProbeContext {
    signal: AbortSignal;
    now(): string;
}
export interface NetworkProbe<C = Record<string, unknown>, R = Record<string, unknown>> {
    name: string;
    type: ProbeType;
    config: C;
    execute(context: ProbeContext): Promise<ProbeResult<R>>;
}
export interface ConnectivityStatus {
    online: boolean;
    ipv4: boolean;
    ipv6: boolean;
    captivePortal: boolean;
    gatewayReachable: boolean;
    dnsFailures: number;
    checkedAt: string;
}
export interface NetworkMeasurement {
    id: string;
    timestamp: string;
    probeType: ProbeType;
    latency: number | null;
    success: boolean;
    error: string | null;
    metadata: Record<string, unknown>;
}
export interface NetworkHealthScore {
    id: string;
    timestamp: string;
    score: number;
    factors: Record<string, unknown>;
}
export interface NetworkNode {
    id: string;
    name: string;
    location?: string;
    endpoint: string;
    status: 'active' | 'degraded' | 'offline' | 'unknown';
}
export interface MonitoringSnapshot {
    status: 'healthy' | 'degraded' | 'unhealthy';
    score: NetworkHealthScore;
    measurements: NetworkMeasurement[];
    failures: Record<string, number>;
    issues: string[];
}
type Store = {
    measurements: NetworkMeasurement[];
    healthScores: NetworkHealthScore[];
    nodes: NetworkNode[];
};
export declare const createNetworkTelemetryStore: () => Store;
export declare const getNetworkInterfaces: () => NetworkInterfaceInfo[];
export declare const detectIpCapabilities: () => {
    ipv4: boolean;
    ipv6: boolean;
};
export declare const measureLatency: (operation: () => Promise<unknown>) => Promise<number>;
export declare class DnsLatencyProbe implements NetworkProbe<{
    hostname: string;
    timeoutMs: number;
}, {
    addressCount: number;
    family?: number;
}> {
    config: {
        hostname: string;
        timeoutMs: number;
    };
    name: string;
    type: "dns";
    constructor(config?: {
        hostname: string;
        timeoutMs: number;
    });
    execute(context: ProbeContext): Promise<ProbeResult<{
        addressCount: number;
    }>>;
}
export declare class TcpLatencyProbe implements NetworkProbe<{
    host: string;
    port: number;
    timeoutMs: number;
}, {
    host: string;
    port: number;
}> {
    config: {
        host: string;
        port: number;
        timeoutMs: number;
    };
    name: string;
    type: "tcp";
    constructor(config?: {
        host: string;
        port: number;
        timeoutMs: number;
    });
    execute(context: ProbeContext): Promise<ProbeResult<{
        host: string;
        port: number;
    }>>;
}
export declare class HttpAvailabilityProbe implements NetworkProbe<{
    url: string;
    timeoutMs: number;
}, {
    statusCode?: number;
    bytesRead: number;
}> {
    config: {
        url: string;
        timeoutMs: number;
    };
    name: string;
    type: "http";
    constructor(config?: {
        url: string;
        timeoutMs: number;
    });
    execute(context: ProbeContext): Promise<ProbeResult<{
        bytesRead: number;
    }>>;
}
export declare class IpCapabilityProbe implements NetworkProbe {
    name: string;
    type: "ip";
    config: {};
    execute(context: ProbeContext): Promise<ProbeResult<{}>>;
}
export declare class ProviderInfoProbe implements NetworkProbe {
    name: string;
    type: "provider";
    config: {};
    execute(context: ProbeContext): Promise<ProbeResult<{
        provider: null;
        source: string;
        scorable: boolean;
    }>>;
}
export declare class PacketLossProbe implements NetworkProbe<{
    attempts: number;
    timeoutMs: number;
    host: string;
}, {
    attempts: number;
    lost: number;
    lossRatio: number;
    method: string;
}> {
    config: {
        attempts: number;
        timeoutMs: number;
        host: string;
    };
    name: string;
    type: "packet_loss";
    constructor(config?: {
        attempts: number;
        timeoutMs: number;
        host: string;
    });
    execute(context: ProbeContext): Promise<ProbeResult<{
        attempts: number;
        lost: number;
        lossRatio: number;
        method: string;
    }>>;
}
export declare class StabilityProbe implements NetworkProbe<{
    attempts: number;
    timeoutMs: number;
    host: string;
}, {
    attempts: number;
    lost: number;
    lossRatio: number;
    method: string;
}> {
    config: {
        attempts: number;
        timeoutMs: number;
        host: string;
    };
    name: string;
    type: "stability";
    constructor(config?: {
        attempts: number;
        timeoutMs: number;
        host: string;
    });
    execute(context: ProbeContext): Promise<{
        name: string;
        probeType: "stability";
        success: boolean;
        latencyMs: number;
        timestamp: string;
        error?: string;
        metadata: {
            attempts: number;
            lost: number;
            lossRatio: number;
            method: string;
        };
    }>;
}
type ThroughputConfig = {
    downloadUrl?: string;
    uploadUrl?: string;
    bytes: number;
    timeoutMs: number;
};
type ThroughputMetadata = {
    downloadMbps?: number;
    uploadMbps?: number;
    bytes: number;
    measured: boolean;
};
export declare class ThroughputProbe implements NetworkProbe<ThroughputConfig, ThroughputMetadata> {
    config: ThroughputConfig;
    name: string;
    type: "throughput";
    constructor(config?: ThroughputConfig);
    private transfer;
    execute(context: ProbeContext): Promise<ProbeResult<ThroughputMetadata>>;
}
export declare const defaultNetworkProbes: () => NetworkProbe[];
export declare class NetworkMonitoringService {
    private readonly probes;
    private readonly store;
    private readonly intervalMs;
    private readonly retries;
    private timer;
    private running;
    private readonly failures;
    private abortController;
    constructor(probes?: NetworkProbe[], store?: Store, intervalMs?: number, retries?: number);
    start(): void;
    stop(): void;
    runOnce(): Promise<MonitoringSnapshot>;
    private collectOnce;
    snapshot(measurements?: NetworkMeasurement[], score?: NetworkHealthScore): MonitoringSnapshot;
    measurements(): NetworkMeasurement[];
}
export declare const calculateHealthScore: (measurements: NetworkMeasurement[]) => NetworkHealthScore;
export declare class ConnectivityMonitor {
    private readonly dnsHostname;
    private readonly captivePortalUrl;
    private last?;
    constructor(dnsHostname?: string, captivePortalUrl?: string);
    private gateway;
    private ping;
    private captivePortal;
    status(): Promise<ConnectivityStatus>;
    snapshot(): ConnectivityStatus | undefined;
}
export {};
//# sourceMappingURL=index.d.ts.map