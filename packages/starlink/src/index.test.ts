import { describe, expect, it } from 'vitest';
import { StarlinkProvider, type StarlinkCommandRunner } from './index.js';

class FakeRunner implements StarlinkCommandRunner {
  constructor(private readonly reachable = true, private readonly status?: Record<string, unknown>) {}

  async run(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (command === 'grpcurl') {
      return this.status
        ? { stdout: JSON.stringify({ dish_get_status: this.status }), stderr: '', exitCode: 0 }
        : { stdout: '', stderr: 'unavailable', exitCode: 1 };
    }
    return { stdout: '', stderr: '', exitCode: this.reachable ? 0 : 1 };
  }
}

describe('StarlinkProvider', () => {
  it('discovers a reachable dish and reports telemetry-backed health', async () => {
    const provider = new StarlinkProvider({
      commandRunner: new FakeRunner(true, {
        state: 'CONNECTED',
        pop_ping_latency_ms: 42,
        pop_ping_drop_rate: 0.01,
        downlink_throughput_bps: 120_000_000,
        uplink_throughput_bps: 20_000_000,
        obstruction_stats: { fraction_obstructed: 0.005 },
      }),
    });

    const resources = await provider.discover();
    expect(resources).toHaveLength(1);
    expect(resources[0]?.id).toBe('starlink-dish');
    expect(resources[0]?.health?.status).toBe('healthy');
    expect(resources[0]?.health?.latencyMs).toBe(42);
    expect(resources[0]?.health?.bandwidthMbps).toBe(120);
  });

  it('reports the dish as unavailable when the local API cannot be reached', async () => {
    const provider = new StarlinkProvider({ commandRunner: new FakeRunner(false) });
    const resources = await provider.discover();
    expect(resources[0]?.state).toBe('unavailable');
    expect(resources[0]?.health).toBeUndefined();
  });

  it('never pretends to own the physical dish lifecycle', async () => {
    const provider = new StarlinkProvider({ commandRunner: new FakeRunner(true) });
    const result = await provider.disconnect('starlink-dish');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('does not own dish power');
  });
});
