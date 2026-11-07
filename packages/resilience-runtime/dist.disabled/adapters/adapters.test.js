import { describe, expect, it } from 'vitest';
import { SubsystemDecisionAdapter } from './adapters.js';
import { createRuntimeContext } from '../index.js';
const incident = (rootCause, metadata) => ({
    id: 'incident-1',
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    correlationId: 'decision-test',
    source: 'test',
    metadata,
    rootCause,
    affectedComponents: ['tunnel'],
    confidence: 0.98,
    evidence: ['observation-1'],
    correlationReason: 'test tunnel recovery decision',
    classification: 'independent_failure',
});
describe('SubsystemDecisionAdapter WireGuard recovery', () => {
    it('creates a tunnel_switch candidate requiring tunnel.write for an active peer failure', async () => {
        const result = await new SubsystemDecisionAdapter().decide([
            incident('tunnel_wireguard_handshake', {
                tunnelProviderId: 'wireguard',
                tunnelId: 'wg-1',
                reconnect: true,
            }),
        ], createRuntimeContext({ correlationId: 'decision-test', mode: 'live' }));
        expect(result[0]).toMatchObject({
            intent: 'tunnel_switch',
            requiredCapabilities: ['tunnel.write'],
            metadata: { providerId: 'wireguard', tunnelId: 'wg-1', reconnect: true },
        });
    });
    it('creates an initial connect candidate only for an explicit autoconnect observation', async () => {
        const result = await new SubsystemDecisionAdapter().decide([
            incident('tunnel_wireguard_autoconnect', {
                tunnelProviderId: 'wireguard',
                reconnect: false,
            }),
        ], createRuntimeContext({ correlationId: 'decision-test', mode: 'live' }));
        expect(result[0]).toMatchObject({
            intent: 'tunnel_switch',
            requiredCapabilities: ['tunnel.write'],
            metadata: { providerId: 'wireguard', reconnect: false },
        });
    });
    it('does not create reconnect candidates when the provider is unknown or retry budget is exhausted', async () => {
        const unknown = await new SubsystemDecisionAdapter().decide([
            incident('tunnel_other_handshake', { tunnelProviderId: 'unknown', reconnect: true }),
        ], createRuntimeContext({ mode: 'live' }));
        const exhausted = await new SubsystemDecisionAdapter().decide([
            incident('tunnel_wireguard_handshake', {
                tunnelProviderId: 'wireguard',
                reconnect: true,
                recoveryExhausted: true,
            }),
        ], createRuntimeContext({ mode: 'live' }));
        expect(unknown[0]?.intent).toBe('health_reprobe');
        expect(exhausted[0]?.intent).toBe('health_reprobe');
    });
});
//# sourceMappingURL=adapters.test.js.map