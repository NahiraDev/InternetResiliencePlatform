import { Scheduler } from './Scheduler.js';
import { NetworkSampler } from './NetworkSampler.js';
import {
  NetworkEventEmitter,
  type NetworkEventHandler,
  type NetworkEventName,
} from '../events/NetworkEvents.js';
import type { HistoryWindow, NetworkSnapshot } from '../models/NetworkSnapshot.js';
export interface NetworkMonitorOptions {
  samplingIntervalMs: number;
  maxHistoryMs: number;
  packetLossHighThreshold: number;
  latencyChangeThresholdMs: number;
  qualityChangeThreshold: number;
  bandwidthChangeThresholdMbps: number;
}
export const DEFAULT_MONITOR_OPTIONS: NetworkMonitorOptions = {
  samplingIntervalMs: 5_000,
  maxHistoryMs: 86_400_000,
  packetLossHighThreshold: 0.05,
  latencyChangeThresholdMs: 20,
  qualityChangeThreshold: 5,
  bandwidthChangeThresholdMbps: 5,
};
const WINDOW_MS: Record<HistoryWindow, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '30m': 1_800_000,
  '24h': 86_400_000,
};
export class NetworkMonitor {
  private readonly events = new NetworkEventEmitter();
  private readonly snapshots: NetworkSnapshot[] = [];
  private controller: AbortController | undefined;
  private readonly scheduler: Scheduler;
  constructor(
    private readonly sampler: NetworkSampler,
    private readonly options: NetworkMonitorOptions = DEFAULT_MONITOR_OPTIONS,
  ) {
    this.scheduler = new Scheduler(
      async (signal) => {
        await this.collect(signal);
      },
      { intervalMs: options.samplingIntervalMs, runImmediately: true },
    );
  }
  start(): void {
    if (this.controller) return;
    this.controller = new AbortController();
    this.scheduler.start(this.controller.signal);
  }
  stop(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.scheduler.stop();
  }
  snapshot(): NetworkSnapshot | undefined {
    return this.snapshots.at(-1);
  }
  history(window: HistoryWindow = '24h'): readonly NetworkSnapshot[] {
    const cutoff = Date.now() - WINDOW_MS[window];
    return this.snapshots.filter((s) => Date.parse(s.timestamp) >= cutoff);
  }
  subscribe<K extends NetworkEventName>(event: K, handler: NetworkEventHandler<K>): void {
    this.events.subscribe(event, handler);
  }
  unsubscribe<K extends NetworkEventName>(event: K, handler: NetworkEventHandler<K>): void {
    this.events.unsubscribe(event, handler);
  }
  health(): { running: boolean; samples: number; latest: NetworkSnapshot | undefined } {
    return {
      running: this.scheduler.isRunning(),
      samples: this.snapshots.length,
      latest: this.snapshot(),
    };
  }
  async collect(signal: AbortSignal = new AbortController().signal): Promise<NetworkSnapshot> {
    const previous = this.snapshot();
    const current = await this.sampler.sample(signal);
    this.snapshots.push(current);
    this.prune();
    await this.emitChanges(previous, current);
    return current;
  }
  private prune(): void {
    const cutoff = Date.now() - this.options.maxHistoryMs;
    while (this.snapshots[0] && Date.parse(this.snapshots[0].timestamp) < cutoff)
      this.snapshots.shift();
  }
  private async emitChanges(
    previous: NetworkSnapshot | undefined,
    current: NetworkSnapshot,
  ): Promise<void> {
    if (!previous) {
      await this.events.emit(
        current.internetReachable ? 'network.online' : 'network.offline',
        current,
      );
      return;
    }
    if (previous.internetReachable !== current.internetReachable)
      await this.events.emit(
        current.internetReachable ? 'network.online' : 'network.offline',
        current,
      );
    if (
      Math.abs((current.latencyMs ?? 0) - (previous.latencyMs ?? 0)) >=
      this.options.latencyChangeThresholdMs
    )
      await this.events.emit('latency.changed', {
        previous: previous.latencyMs,
        current: current.latencyMs,
        snapshot: current,
      });
    if (
      Math.abs(current.qualityScore - previous.qualityScore) >= this.options.qualityChangeThreshold
    )
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
    if (
      Math.abs((current.bandwidthMbps ?? 0) - (previous.bandwidthMbps ?? 0)) >=
      this.options.bandwidthChangeThresholdMbps
    )
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
