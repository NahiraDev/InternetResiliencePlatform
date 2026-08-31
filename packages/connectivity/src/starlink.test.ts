import { describe, expect, it } from 'vitest';
import { StarlinkDishClient, StarlinkProvider, type StarlinkCommandRunner } from './starlink.js';

class FakeRunner implements StarlinkCommandRunner {
  constructor(private readonly status?: Record<string, unknown>) {}

  async run(): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.status
      ? { stdout: JSON.stringify({ dish_get_status: this.status }), stderr: '', exitCode: 0 }
      : { stdout: '', stderr: 'unavailable', exitCode: 1 };
  }
}

describe('Starlink integration', () => {
  it('parses dish telemetry through the local gRPC API', async () => {
    const client = new StarlinkDishClient({ target: '192.168.100.1:9200' });
    const status = await client.getStatus(new FakeRunner({
      state: 'CONNECTED',
      pop_ping_latency_ms: 42,
      pop_ping_drop_rate: 0.01,
      downlink_throughput_bps: 120_000_000,
      uplink_throughput_bps: 20_000_000,
      obstruction_stats: { fraction_obstructed: 0.005 },
    }));

    expect(status?.state).toBe('CONNECTED');
    expect(status?.latencyMs).toBe(42);
    expect(status?.downloadMbps).toBe(120);
    expect(status?.obstructionPercent).toBeCloseTo(0.5);
  });

  it('keeps dish lifecycle ownership outside the provider', async () => {
    const provider = new StarlinkProvider({ commandRunner: new FakeRunner() });
    const result = await provider.disconnect('starlink-dish');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('does not own dish power');
  });

  it('rejects invalid local API targets', () => {
    expect(() => new StarlinkDishClient({ target: 'not-a-target' })).toThrow('Invalid Starlink gRPC target');
  });
});
