import { describe, expect, it } from 'vitest';
import { NetworkMonitoringService, calculateHealthScore, type NetworkProbe } from './index.js';

const probe = (success: boolean): NetworkProbe => ({
  name: success ? 'ok' : 'bad',
  type: 'dns',
  config: {},
  async execute() { return { name: this.name, probeType: this.type, success, latencyMs: success ? 25 : 500, timestamp: new Date().toISOString(), metadata: {}, ...(success ? {} : { error: 'mock failure' }) }; },
});

describe('network monitoring core', () => {
  it('runs plugin probes, tracks failures, and scores health', async () => {
    const service = new NetworkMonitoringService([probe(true), probe(false)], undefined, 1000, 0);
    const snapshot = await service.runOnce();
    expect(snapshot.measurements).toHaveLength(2);
    expect(snapshot.failures.bad).toBe(1);
    expect(snapshot.score.score).toBeLessThan(100);
  });
  it('calculates healthy scores for successful low-latency measurements', () => {
    const score = calculateHealthScore([{ id: '1', timestamp: new Date().toISOString(), probeType: 'dns', latency: 20, success: true, error: null, metadata: {} }]);
    expect(score.score).toBe(100);
  });
});
