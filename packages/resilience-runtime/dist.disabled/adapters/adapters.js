import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
export class SubsystemDecisionAdapter {
    async decide(incidents, context) {
        if (!incidents.length)
            return [this.candidate('noop', context, 1, 0, 1, [])];
        return incidents.map((i) => {
            if (i.classification === 'security_failure')
                return this.candidate('degraded_mode', context, 0.4, 0.1, i.confidence, []);
            if (i.rootCause.includes('dns'))
                return this.candidate('dns_switch', context, 0.8, 0.3, i.confidence, ['dns.write']);
            const tunnelProviderId = i.metadata['tunnelProviderId'];
            const reconnect = i.metadata['reconnect'];
            const recoveryExhausted = i.metadata['recoveryExhausted'] === true;
            if (i.rootCause.startsWith('tunnel_wireguard_') &&
                tunnelProviderId === 'wireguard' &&
                typeof reconnect === 'boolean' &&
                !recoveryExhausted) {
                return this.candidate('tunnel_switch', context, 0.9, 0.25, i.confidence, ['tunnel.write'], {
                    providerId: 'wireguard',
                    ...(typeof i.metadata['tunnelId'] === 'string' ? { tunnelId: i.metadata['tunnelId'] } : {}),
                    reconnect,
                });
            }
            return this.candidate('health_reprobe', context, 0.2, 0.05, i.confidence, []);
        });
    }
    candidate(intent, context, benefit, risk, confidence, caps, extraMetadata = {}) {
        return deepFreeze({
            id: nextId('candidate'),
            schemaVersion: 1,
            createdAt: nowIso(),
            correlationId: context.correlationId,
            source: 'subsystem-decision-adapter',
            metadata: { delegated: true, ...extraMetadata },
            intent,
            expectedBenefit: benefit,
            risk,
            confidence,
            requiredCapabilities: caps,
            dependencies: intent === 'noop' ? [] : [intent],
            postconditions: intent === 'noop' ? ['no mutation performed'] : [`${intent} verified`],
            verificationRequirements: intent === 'noop' ? [] : [`${intent} postcondition`],
            rejectionReasons: [],
        });
    }
}
//# sourceMappingURL=adapters.js.map