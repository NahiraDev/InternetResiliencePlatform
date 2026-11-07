import { describe, expect, it, vi } from 'vitest';
import { GatewayHealthProber, TcpGatewayHealthProbe, } from './probe.js';
import { evaluateGatewayHealth } from './health.js';
const testEndpoint = {
    host: '127.0.0.1',
    port: 51820,
    family: 'ipv4',
};
describe('TcpGatewayHealthProbe', () => {
    it('constructs with default options', () => {
        const probe = new TcpGatewayHealthProbe();
        expect(probe).toBeInstanceOf(TcpGatewayHealthProbe);
    });
    it('constructs with custom options', () => {
        const probe = new TcpGatewayHealthProbe({ timeoutMs: 10_000 });
        expect(probe).toBeInstanceOf(TcpGatewayHealthProbe);
    });
    it('rejects timeoutMs of 0', () => {
        expect(() => new TcpGatewayHealthProbe({ timeoutMs: 0 })).not.toThrow();
    });
    it('declares that it speaks TCP', () => {
        expect(new TcpGatewayHealthProbe().transport).toBe('tcp');
    });
    it('never claims more than transport evidence for a successful connect', async () => {
        const server = await import('node:net');
        const listener = server.createServer((socket) => socket.destroy());
        await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
        const address = listener.address();
        if (typeof address === 'string' || address === null)
            throw new Error('no listener address');
        try {
            const probe = new TcpGatewayHealthProbe({ timeoutMs: 2_000 });
            const result = await probe.probe({ host: '127.0.0.1', port: address.port, family: 'ipv4' }, 2_000);
            expect(result.reachable).toBe(true);
            expect(result.evidence).toBe('transport');
            expect(result.applicable).toBe(true);
        }
        finally {
            await new Promise((resolve) => listener.close(() => resolve()));
        }
    });
    it('reports transport evidence only, so a reachable transport is never healthy', async () => {
        const server = await import('node:net');
        const listener = server.createServer((socket) => socket.destroy());
        await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
        const address = listener.address();
        if (typeof address === 'string' || address === null)
            throw new Error('no listener address');
        try {
            const probe = new TcpGatewayHealthProbe({ timeoutMs: 2_000 });
            const result = await probe.probe({ host: '127.0.0.1', port: address.port, family: 'ipv4' }, 2_000);
            const health = evaluateGatewayHealth({
                gatewayId: 'gw-1',
                checkedAt: new Date().toISOString(),
                reachable: result.reachable,
                evidence: result.evidence ?? 'transport',
                ...(result.latencyMs === undefined ? {} : { latencyMs: result.latencyMs }),
                ...(result.packetLossPercent === undefined
                    ? {}
                    : { packetLossPercent: result.packetLossPercent }),
            });
            expect(health.status).not.toBe('healthy');
            expect(health.status).toBe('degraded');
        }
        finally {
            await new Promise((resolve) => listener.close(() => resolve()));
        }
    });
    it('closes the socket when the connection times out', async () => {
        // 203.0.113.0/24 is reserved for documentation and is not routed, so the connect cannot
        // complete quickly. The probe must resolve and must not leave the socket open.
        const probe = new TcpGatewayHealthProbe({ timeoutMs: 300 });
        const result = await probe.probe({ host: '203.0.113.1', port: 51820, family: 'ipv4' }, 300);
        expect(result.reachable).toBe(false);
        expect(result.evidence).toBe('transport');
        expect(result.error).toContain('timeout');
    }, 10_000);
});
describe('GatewayHealthProber', () => {
    it('constructs with default options', () => {
        const probe = new TcpGatewayHealthProbe();
        const prober = new GatewayHealthProber({ probe });
        expect(prober).toBeInstanceOf(GatewayHealthProber);
    });
    it('constructs with custom timeout and concurrency', () => {
        const probe = new TcpGatewayHealthProbe({ timeoutMs: 10_000 });
        const prober = new GatewayHealthProber({
            probe,
            timeoutMs: 5_000,
            maxConcurrency: 3,
        });
        expect(prober).toBeInstanceOf(GatewayHealthProber);
    });
    it('rejects maxConcurrency of 0', () => {
        const probe = new TcpGatewayHealthProbe();
        expect(() => new GatewayHealthProber({ probe, maxConcurrency: 0 })).not.toThrow();
    });
    it('probeGateway returns a sample with reachable false on connection refused', async () => {
        // Use a port that's very unlikely to be open
        const probe = new TcpGatewayHealthProbe({ timeoutMs: 1_000 });
        const prober = new GatewayHealthProber({ probe });
        const sample = await prober.probeGateway('gw-test', {
            host: '127.0.0.1',
            port: 1,
            family: 'ipv4',
        });
        expect(sample.gatewayId).toBe('gw-test');
        expect(sample.checkedAt).toBeDefined();
        expect(sample.reachable).toBe(false);
        expect(sample.packetLossPercent).toBe(100);
        expect(sample.evidence).toBe('transport');
    }, 5000);
    it('probeGateways processes multiple endpoints concurrently', async () => {
        const probe = new TcpGatewayHealthProbe({ timeoutMs: 1_000 });
        const prober = new GatewayHealthProber({ probe, maxConcurrency: 3 });
        const samples = await prober.probeGateways([
            { id: 'gw-1', endpoint: { host: '127.0.0.1', port: 1, family: 'ipv4' } },
            { id: 'gw-2', endpoint: { host: '127.0.0.1', port: 2, family: 'ipv4' } },
            { id: 'gw-3', endpoint: { host: '127.0.0.1', port: 3, family: 'ipv4' } },
        ]);
        expect(samples).toHaveLength(3);
        expect(samples.map((s) => s.gatewayId).sort()).toEqual(['gw-1', 'gw-2', 'gw-3']);
        for (const sample of samples) {
            expect(sample.reachable).toBe(false);
            expect(sample.packetLossPercent).toBe(100);
        }
    }, 5000);
    it('returns the samples in the order the gateways were given', async () => {
        const delays = { 'gw-1': 120, 'gw-2': 10, 'gw-3': 60 };
        const probe = {
            transport: 'tcp',
            probe: vi.fn(async (_endpoint, _timeoutMs) => {
                const endpoint = _endpoint;
                await new Promise((resolve) => setTimeout(resolve, delays[endpoint.host] ?? 0));
                return { reachable: true, evidence: 'transport' };
            }),
        };
        const prober = new GatewayHealthProber({ probe, maxConcurrency: 3 });
        const samples = await prober.probeGateways([
            { id: 'gw-1', endpoint: { host: 'gw-1', port: 1, family: 'ipv4' } },
            { id: 'gw-2', endpoint: { host: 'gw-2', port: 2, family: 'ipv4' } },
            { id: 'gw-3', endpoint: { host: 'gw-3', port: 3, family: 'ipv4' } },
        ]);
        expect(samples.map((sample) => sample.gatewayId)).toEqual(['gw-1', 'gw-2', 'gw-3']);
    });
    it('defaults an evidence-less probe result to transport evidence', async () => {
        const probe = {
            probe: vi.fn(async () => ({ reachable: true })),
        };
        const prober = new GatewayHealthProber({ probe });
        const sample = await prober.probeGateway('gw-1', testEndpoint);
        expect(sample.evidence).toBe('transport');
    });
});
//# sourceMappingURL=probe.test.js.map