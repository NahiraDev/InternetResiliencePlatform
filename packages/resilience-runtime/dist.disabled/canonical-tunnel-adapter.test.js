import { describe, expect, it } from 'vitest';
import { CanonicalTunnelRuntimeAdapter } from './canonical-tunnel-adapter.js';
const runtimeContext = () => ({
    runtimeId: 'tunnel-adapter-test',
    correlationId: 'tunnel-adapter-test',
    mode: 'live',
});
const reconnectPlan = () => ({
    selectedAction: {
        id: 'action-reconnect',
        intent: 'tunnel_switch',
        metadata: {
            providerId: 'wireguard',
            tunnelId: 'wg-managed-1',
            reconnect: true,
        },
    },
    expectedPostconditions: ['tunnel handshake verified'],
});
describe('CanonicalTunnelRuntimeAdapter reconnect', () => {
    it('uses the managed reconnect operation instead of creating another tunnel', async () => {
        let connectCalls = 0;
        let reconnectRequest;
        const controlPlane = {
            configured: true,
            activeTunnel: 'wg-managed-1',
            managedTunnel: 'wg-managed-1',
            connect: async () => {
                connectCalls += 1;
                return { tunnelId: 'wrong-new-tunnel', providerId: 'wireguard', connectionId: 'new' };
            },
            reconnect: async (request) => {
                reconnectRequest = request;
                return { tunnelId: 'wg-managed-1', providerId: 'wireguard', connectionId: 'reconnected' };
            },
            verify: async () => true,
            rollback: async () => true,
        };
        const adapter = new CanonicalTunnelRuntimeAdapter(controlPlane);
        const execution = await adapter.execute(reconnectPlan(), runtimeContext());
        expect(execution.status).toBe('success');
        expect(connectCalls).toBe(0);
        expect(reconnectRequest).toEqual({ providerId: 'wireguard', tunnelId: 'wg-managed-1' });
        await expect(adapter.verify(reconnectPlan(), execution, runtimeContext())).resolves.toMatchObject({
            status: 'success',
        });
    });
    it('fails closed when a reconnect action is planned but the control plane has no reconnect port', async () => {
        let connectCalls = 0;
        const controlPlane = {
            configured: true,
            activeTunnel: 'wg-managed-1',
            managedTunnel: 'wg-managed-1',
            connect: async () => {
                connectCalls += 1;
                return { tunnelId: 'wg-new', providerId: 'wireguard', connectionId: 'new' };
            },
            verify: async () => true,
            rollback: async () => true,
        };
        const execution = await new CanonicalTunnelRuntimeAdapter(controlPlane).execute(reconnectPlan(), runtimeContext());
        expect(execution.status).toBe('failed');
        expect(connectCalls).toBe(0);
    });
});
//# sourceMappingURL=canonical-tunnel-adapter.test.js.map