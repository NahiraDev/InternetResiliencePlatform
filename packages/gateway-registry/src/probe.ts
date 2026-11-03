import type { GatewayEndpoint } from './index.js';
import type {
  GatewayHealthProbe,
  GatewayHealthSample,
  GatewayProbeResult,
} from './health.js';

const DEFAULT_PACKET_COUNT = 3;
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * UDP-based gateway health probe. Sends UDP datagrams to the gateway endpoint
 * and measures round-trip timing where a response is received. Many gateways
 * do not respond to unsolicited UDP, so unreachable results are conservative
 * (assume failure) and latency measurements reflect observed round-trips only
 * when a response comes back.
 */
export class UdpGatewayHealthProbe implements GatewayHealthProbe {
  private readonly packetCount: number;
  private readonly timeoutMs: number;

  constructor(options: { packetCount?: number; timeoutMs?: number } = {}) {
    this.packetCount = Math.max(1, options.packetCount ?? DEFAULT_PACKET_COUNT);
    this.timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async probe(endpoint: GatewayEndpoint, timeoutMs: number): Promise<GatewayProbeResult> {
    const dgramModule = await import('node:dgram');
    const dgram = (dgramModule.default ?? dgramModule) as typeof import('node:dgram');

    return new Promise<GatewayProbeResult>((resolve) => {
      const socket = dgram.createSocket('udp4');
      let sent = 0;
      let received = 0;
      const latencies: number[] = [];
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(totalTimer);
        socket.close();
        resolve({
          reachable: received > 0,
          ...(latencies.length > 0
            ? { latencyMs: Math.min(...latencies) }
            : {}),
          packetLossPercent:
            sent === 0 ? 100 : Math.round(((sent - received) / sent) * 100),
        });
      };

      const totalTimer = setTimeout(finish, timeoutMs);

      socket.on('error', (error: Error) => {
        finish();
        resolve({
          reachable: false,
          error: error.message,
          packetLossPercent: 100,
        });
      });

      socket.on('message', (_msg: Buffer, rinfo: { address: string; port: number }) => {
        if (resolved) return;
        if (rinfo.address === endpoint.host && rinfo.port === endpoint.port) {
          received += 1;
          latencies.push(Date.now() - batchStart);
        }
      });

      const payload = Buffer.from('IRP-PROBE');
      let batchStart = Date.now();
      let interval: NodeJS.Timeout | undefined;

      const sendNext = () => {
        if (resolved || sent >= this.packetCount) {
          if (interval) clearInterval(interval);
          finish();
          return;
        }
        sent += 1;
        batchStart = Date.now();
        socket.send(payload, 0, payload.length, endpoint.port, endpoint.host, (err: Error | null) => {
          if (err) {
            // treat send failure as a lost packet
          }
        });
      };

      interval = setInterval(sendNext, 150);
      sendNext();
    });
  }
}

/**
 * TCP-based gateway health probe. Measures TCP connect time to the gateway
 * endpoint. A successful connection within the timeout means the gateway is
 * reachable; connection timeout or refusal means unreachable.
 */
export class TcpGatewayHealthProbe implements GatewayHealthProbe {
  private readonly timeoutMs: number;

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async probe(endpoint: GatewayEndpoint, timeoutMs: number): Promise<GatewayProbeResult> {
    const netModule = await import('node:net');
    const connect = netModule.connect ?? netModule.default?.connect;

    return new Promise<GatewayProbeResult>((resolve) => {
      const start = Date.now();
      const timer = setTimeout(() => {
        resolve({
          reachable: false,
          packetLossPercent: 100,
          error: `connection timeout after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      const socket = connect({ host: endpoint.host, port: endpoint.port }, () => {
        clearTimeout(timer);
        const latencyMs = Date.now() - start;
        socket.destroy();
        resolve({
          reachable: true,
          latencyMs,
          packetLossPercent: 0,
        });
      });

      socket.on('error', (error: Error) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({
          reachable: false,
          packetLossPercent: 100,
          error: error.message,
        });
      });
    });
  }
}

/**
 * Manages gateway health probing with concurrency control and converts probe
 * results into GatewayHealthSample records suitable for gateway selection.
 */
export class GatewayHealthProber {
  private readonly probe: GatewayHealthProbe;
  private readonly timeoutMs: number;
  private readonly maxConcurrency: number;

  constructor(options: {
    probe: GatewayHealthProbe;
    timeoutMs?: number;
    maxConcurrency?: number;
  }) {
    this.probe = options.probe;
    this.timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 10);
  }

  /**
   * Probe a single gateway endpoint and return a health sample.
   */
  async probeGateway(
    gatewayId: string,
    endpoint: GatewayEndpoint,
  ): Promise<GatewayHealthSample> {
    const result = await this.probe.probe(endpoint, this.timeoutMs);
    return {
      gatewayId,
      checkedAt: new Date().toISOString(),
      reachable: result.reachable,
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
      ...(result.packetLossPercent !== undefined
        ? { packetLossPercent: result.packetLossPercent }
        : {}),
    };
  }

  /**
   * Probe multiple gateways concurrently (bounded by maxConcurrency) and return
   * health samples for each.
   */
  async probeGateways(
    gateways: { id: string; endpoint: GatewayEndpoint }[],
  ): Promise<GatewayHealthSample[]> {
    const samples: GatewayHealthSample[] = [];
    let index = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const i = index++;
        if (i >= gateways.length) return;
        const gw = gateways[i];
        if (!gw) return;
        try {
          const sample = await this.probeGateway(gw.id, gw.endpoint);
          samples.push(sample);
        } catch {
          samples.push({
            gatewayId: gw.id,
            checkedAt: new Date().toISOString(),
            reachable: false,
            packetLossPercent: 100,
          });
        }
      }
    };

    const workers = Array.from({ length: Math.min(this.maxConcurrency, gateways.length) }, () =>
      worker(),
    );
    await Promise.all(workers);
    return samples;
  }
}
