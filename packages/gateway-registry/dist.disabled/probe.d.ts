import type { GatewayEndpoint } from './index.js';
import type { GatewayHealthProbe, GatewayHealthSample, GatewayProbeResult } from './health.js';
/**
 * TCP transport probe.
 *
 * A successful TCP connect proves exactly one thing: something is listening on that address.
 * It says nothing about the tunnel protocol, and nothing about whether traffic egresses through
 * the gateway. The probe therefore reports `evidence: 'transport'`, which
 * {@link evaluateGatewayHealth} refuses to score as `healthy`.
 *
 * The probe is also refused for endpoints that do not speak TCP: a UDP-only tunnel peer (for
 * example WireGuard) must never be reported as unreachable just because a TCP connect was
 * attempted. Such a probe reports `applicable: false` and carries no evidence.
 */
export declare class TcpGatewayHealthProbe implements GatewayHealthProbe {
    readonly transport: "tcp";
    private readonly timeoutMs;
    constructor(options?: {
        timeoutMs?: number;
    });
    probe(endpoint: GatewayEndpoint, timeoutMs: number): Promise<GatewayProbeResult>;
}
/**
 * Manages gateway health probing with concurrency control and converts probe
 * results into GatewayHealthSample records suitable for gateway selection.
 */
export declare class GatewayHealthProber {
    private readonly probe;
    private readonly timeoutMs;
    private readonly maxConcurrency;
    constructor(options: {
        probe: GatewayHealthProbe;
        timeoutMs?: number;
        maxConcurrency?: number;
    });
    /**
     * Probe a single gateway endpoint and return a health sample.
     */
    probeGateway(gatewayId: string, endpoint: GatewayEndpoint): Promise<GatewayHealthSample>;
    /**
     * Probe multiple gateways concurrently (bounded by maxConcurrency) and return
     * health samples for each. The samples are returned in the order the gateways
     * were given, so a selection decision never depends on completion timing.
     */
    probeGateways(gateways: {
        id: string;
        endpoint: GatewayEndpoint;
    }[]): Promise<GatewayHealthSample[]>;
}
//# sourceMappingURL=probe.d.ts.map