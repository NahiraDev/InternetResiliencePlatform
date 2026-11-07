import { NetworkSampler } from './NetworkSampler.js';
import { type NetworkEventHandler, type NetworkEventName } from '../events/NetworkEvents.js';
import type { HistoryWindow, NetworkSnapshot } from '../models/NetworkSnapshot.js';
export interface NetworkMonitorOptions {
    samplingIntervalMs: number;
    maxHistoryMs: number;
    packetLossHighThreshold: number;
    latencyChangeThresholdMs: number;
    qualityChangeThreshold: number;
    bandwidthChangeThresholdMbps: number;
}
export declare const DEFAULT_MONITOR_OPTIONS: NetworkMonitorOptions;
export declare class NetworkMonitor {
    private readonly sampler;
    private readonly options;
    private readonly events;
    private readonly snapshots;
    private controller;
    private readonly scheduler;
    constructor(sampler: NetworkSampler, options?: NetworkMonitorOptions);
    start(): void;
    stop(): void;
    snapshot(): NetworkSnapshot | undefined;
    history(window?: HistoryWindow): readonly NetworkSnapshot[];
    subscribe<K extends NetworkEventName>(event: K, handler: NetworkEventHandler<K>): void;
    unsubscribe<K extends NetworkEventName>(event: K, handler: NetworkEventHandler<K>): void;
    health(): {
        running: boolean;
        samples: number;
        latest: NetworkSnapshot | undefined;
    };
    collect(signal?: AbortSignal): Promise<NetworkSnapshot>;
    private prune;
    private emitChanges;
}
//# sourceMappingURL=NetworkMonitor.d.ts.map