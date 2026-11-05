import { Scheduler } from './Scheduler.js';
import { NetworkEventEmitter, } from '../events/NetworkEvents.js';
export const DEFAULT_MONITOR_OPTIONS = {
    samplingIntervalMs: 5_000,
    maxHistoryMs: 86_400_000,
    packetLossHighThreshold: 0.05,
    latencyChangeThresholdMs: 20,
    qualityChangeThreshold: 5,
    bandwidthChangeThresholdMbps: 5,
};
const WINDOW_MS = {
    '1m': 60_000,
    '5m': 300_000,
    '30m': 1_800_000,
    '24h': 86_400_000,
};
export class NetworkMonitor {
    sampler;
    options;
    events = new NetworkEventEmitter();
    snapshots = [];
    controller;
    scheduler;
    constructor(sampler, options = DEFAULT_MONITOR_OPTIONS) {
        this.sampler = sampler;
        this.options = options;
        this.scheduler = new Scheduler(async (signal) => {
            await this.collect(signal);
        }, { intervalMs: options.samplingIntervalMs, runImmediately: true });
    }
    start() {
        if (this.controller)
            return;
        this.controller = new AbortController();
        this.scheduler.start(this.controller.signal);
    }
    stop() {
        this.controller?.abort();
        this.controller = undefined;
        this.scheduler.stop();
    }
    snapshot() {
        return this.snapshots.at(-1);
    }
    history(window = '24h') {
        const cutoff = Date.now() - WINDOW_MS[window];
        return this.snapshots.filter((s) => Date.parse(s.timestamp) >= cutoff);
    }
    subscribe(event, handler) {
        this.events.subscribe(event, handler);
    }
    unsubscribe(event, handler) {
        this.events.unsubscribe(event, handler);
    }
    health() {
        return {
            running: this.scheduler.isRunning(),
            samples: this.snapshots.length,
            latest: this.snapshot(),
        };
    }
    async collect(signal = new AbortController().signal) {
        const previous = this.snapshot();
        const current = await this.sampler.sample(signal);
        this.snapshots.push(current);
        this.prune();
        await this.emitChanges(previous, current);
        return current;
    }
    prune() {
        const cutoff = Date.now() - this.options.maxHistoryMs;
        while (this.snapshots[0] && Date.parse(this.snapshots[0].timestamp) < cutoff)
            this.snapshots.shift();
    }
    async emitChanges(previous, current) {
        if (!previous) {
            await this.events.emit(current.internetReachable ? 'network.online' : 'network.offline', current);
            return;
        }
        if (previous.internetReachable !== current.internetReachable)
            await this.events.emit(current.internetReachable ? 'network.online' : 'network.offline', current);
        if (Math.abs((current.latencyMs ?? 0) - (previous.latencyMs ?? 0)) >=
            this.options.latencyChangeThresholdMs)
            await this.events.emit('latency.changed', {
                previous: previous.latencyMs,
                current: current.latencyMs,
                snapshot: current,
            });
        if (Math.abs(current.qualityScore - previous.qualityScore) >= this.options.qualityChangeThreshold)
            await this.events.emit('quality.changed', {
                previous: previous.qualityScore,
                current: current.qualityScore,
                snapshot: current,
            });
        if (current.packetLossRatio >= this.options.packetLossHighThreshold)
            await this.events.emit('packetloss.high', current);
        if (previous.ipv6Connectivity !== current.ipv6Connectivity)
            await this.events.emit('ipv6.changed', {
                previous: previous.ipv6Connectivity,
                current: current.ipv6Connectivity,
                snapshot: current,
            });
        if (previous.publicIp !== current.publicIp)
            await this.events.emit('publicip.changed', {
                previous: previous.publicIp,
                current: current.publicIp,
                snapshot: current,
            });
        if (Math.abs((current.bandwidthMbps ?? 0) - (previous.bandwidthMbps ?? 0)) >=
            this.options.bandwidthChangeThresholdMbps)
            await this.events.emit('bandwidth.changed', {
                previous: previous.bandwidthMbps,
                current: current.bandwidthMbps,
                snapshot: current,
            });
        if (previous.gatewayReachable !== current.gatewayReachable)
            await this.events.emit('gateway.changed', {
                previous: previous.gatewayReachable,
                current: current.gatewayReachable,
                snapshot: current,
            });
    }
}
//# sourceMappingURL=NetworkMonitor.js.map