export type NetworkIntelligenceStatus = 'healthy' | 'degraded' | 'offline';

export interface NetworkIntelligenceSnapshot {
  status: NetworkIntelligenceStatus;
  score: number;
  measuredAt: Date;
}

export * from './core/NetworkMonitor.js';
export * from './core/NetworkSampler.js';
export * from './core/Scheduler.js';
export * from './events/NetworkEvents.js';
export * from './metrics/ASNMetric.js';
export * from './metrics/BandwidthMetric.js';
export * from './metrics/DNSMetric.js';
export * from './metrics/GatewayMetric.js';
export * from './metrics/HTTPMetric.js';
export * from './metrics/IPv4Metric.js';
export * from './metrics/IPv6Metric.js';
export * from './metrics/ISPMetric.js';
export * from './metrics/JitterMetric.js';
export * from './metrics/LatencyMetric.js';
export * from './metrics/PacketLossMetric.js';
export * from './metrics/PublicIPMetric.js';
export * from './metrics/TLSMetric.js';
export * from './models/NetworkSnapshot.js';
export * from './models/QualityScore.js';
export * from './providers/DNSProvider.js';
export * from './providers/HTTPProvider.js';
export * from './providers/PingProvider.js';
export * from './utils/Retry.js';
export * from './utils/Statistics.js';
export * from './utils/Timeout.js';
export * from './decision/NetworkDecisionEngine.js';
