import { describe, expect, it } from 'vitest';
import { createRuntimeContext, IncidentCorrelator } from '../index.js';
const batch = (metadata) => ({
    id: 'batch-1',
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    correlationId: 'incident-test',
    source: 'test',
    metadata: {},
    stale: false,
    minConfidence: 0.98,
    observations: [{
            id: 'observation-1',
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            correlationId: 'incident-test',
            source: 'test',
            metadata,
            category: 'tunnel',
            metric: 'wireguard_handshake',
            value: 0,
            timestamp: new Date().toISOString(),
            freshnessMs: 0,
            confidence: 0.98,
            severity: 'critical',
            status: 'failed',
        }],
});
describe('IncidentCorrelator tunnel metadata', () => {
    it('propagates only allowlisted WireGuard recovery metadata', async () => {
        const incidents = await new IncidentCorrelator().correlate(batch({
            tunnelProviderId: 'wireguard',
            tunnelId: 'wg-managed-1',
            reconnect: true,
            recoveryExhausted: false,
            privateKey: 'must-not-propagate',
        }), createRuntimeContext({ correlationId: 'incident-test' }));
        expect(incidents[0]).toMatchObject({
            rootCause: 'tunnel_wireguard_handshake',
            metadata: {
                tunnelProviderId: 'wireguard',
                tunnelId: 'wg-managed-1',
                reconnect: true,
            },
        });
        expect(incidents[0]?.metadata).not.toHaveProperty('privateKey');
    });
});
//# sourceMappingURL=incidents.test.js.map