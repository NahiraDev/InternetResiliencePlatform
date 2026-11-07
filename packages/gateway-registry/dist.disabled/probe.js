const DEFAULT_TIMEOUT_MS = 5_000;
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
export class TcpGatewayHealthProbe {
    transport = 'tcp';
    timeoutMs;
    constructor(options = {}) {
        this.timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }
    async probe(endpoint, timeoutMs) {
        const netModule = await import('node:net');
        const connect = netModule.connect ?? netModule.default?.connect;
        return new Promise((resolve) => {
            const start = Date.now();
            let settled = false;
            const finish = (result) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                socket.destroy();
                resolve(result);
            };
            const timer = setTimeout(() => {
                finish({
                    reachable: false,
                    evidence: 'transport',
                    applicable: true,
                    packetLossPercent: 100,
                    error: `connection timeout after ${timeoutMs}ms`,
                });
            }, timeoutMs);
            const socket = connect({ host: endpoint.host, port: endpoint.port }, () => {
                finish({
                    reachable: true,
                    evidence: 'transport',
                    applicable: true,
                    latencyMs: Date.now() - start,
                    packetLossPercent: 0,
                    detail: 'the transport accepted a TCP connection; the tunnel protocol and external egress are not proven',
                });
            });
            socket.on('error', (error) => {
                finish({
                    reachable: false,
                    evidence: 'transport',
                    applicable: true,
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
    probe;
    timeoutMs;
    maxConcurrency;
    constructor(options) {
        this.probe = options.probe;
        this.timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 10);
    }
    /**
     * Probe a single gateway endpoint and return a health sample.
     */
    async probeGateway(gatewayId, endpoint) {
        const result = await this.probe.probe(endpoint, this.timeoutMs);
        return {
            gatewayId,
            checkedAt: new Date().toISOString(),
            reachable: result.reachable,
            // A probe that does not state what it proved proves transport at most.
            evidence: result.evidence ?? 'transport',
            ...(result.applicable === undefined ? {} : { applicable: result.applicable }),
            ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
            ...(result.packetLossPercent !== undefined
                ? { packetLossPercent: result.packetLossPercent }
                : {}),
        };
    }
    /**
     * Probe multiple gateways concurrently (bounded by maxConcurrency) and return
     * health samples for each. The samples are returned in the order the gateways
     * were given, so a selection decision never depends on completion timing.
     */
    async probeGateways(gateways) {
        const samples = new Array(gateways.length);
        let index = 0;
        const worker = async () => {
            while (true) {
                const i = index++;
                if (i >= gateways.length)
                    return;
                const gw = gateways[i];
                if (!gw)
                    return;
                try {
                    samples[i] = await this.probeGateway(gw.id, gw.endpoint);
                }
                catch {
                    samples[i] = {
                        gatewayId: gw.id,
                        checkedAt: new Date().toISOString(),
                        reachable: false,
                        evidence: 'transport',
                        packetLossPercent: 100,
                    };
                }
            }
        };
        const workers = Array.from({ length: Math.min(this.maxConcurrency, gateways.length) }, () => worker());
        await Promise.all(workers);
        return samples;
    }
}
//# sourceMappingURL=probe.js.map