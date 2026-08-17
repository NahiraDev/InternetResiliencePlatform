export type Environment = 'development' | 'production' | 'test';
export type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown' | 'starting' | 'draining';
export interface VersionInfo {
  name: string;
  version: string;
  node: string;
}
