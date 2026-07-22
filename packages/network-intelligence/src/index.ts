export type NetworkIntelligenceStatus = 'healthy' | 'degraded' | 'offline';

export interface NetworkIntelligenceSnapshot {
  status: NetworkIntelligenceStatus;
  score: number;
  measuredAt: Date;
}
