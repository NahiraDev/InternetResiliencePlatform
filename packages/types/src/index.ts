export type Environment = 'development' | 'production' | 'test';
export type HealthState = 'healthy' | 'degraded' | 'unhealthy';
export interface VersionInfo {
  name: string;
  version: string;
  node: string;
}
