import { FailoverRecoveryEngine, } from '@irp/failover';
import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import { createDefaultRuntimeAdapterRegistry, } from '../adapter-registry.js';
const TRANSITION_REASONS = new Set([
    'active-source-failed',
    'health-degraded',
    'policy-requested',
    'manual-request',
    'preferred-source-recovered',
    'better-source-available',
    'critical-connectivity-loss',
    'provider-disabled',
    'provider-recovered',
    'candidate-activation-failed',
    'candidate-verification-failed',
]);
const TRANSITION_TRIGGERS = new Set([
    'policy',
    'health',
    'manual',
    'provider',
    'recovery',
    'simulation',
]);
const canonicalTransitionReason = (reason) => reason && TRANSITION_REASONS.has(reason)
    ? reason
    : 'critical-connectivity-loss';
const canonicalTransitionTrigger = (trigger) => trigger && TRANSITION_TRIGGERS.has(trigger)
    ? trigger
    : 'recovery';
export class FailoverRecoveryProvider {
    adapters;
    controlPlane;
    constructor(adapters = createDefaultRuntimeAdapterRegistry(), controlPlane) {
        this.adapters = adapters;
        this.controlPlane = controlPlane;
    }
    async recover(plan, reason, context) {
        if (reason.toLowerCase().includes('security')) {
            return this.failed(context, `${reason}; security recovery is fail-closed`, false);
        }
        if (this.controlPlane &&
            (plan.selectedAction.intent === 'connectivity_failover' ||
                plan.selectedAction.intent === 'route_change')) {
            try {
                const engine = new FailoverRecoveryEngine(this.buildRecoveryAdapters(this.controlPlane));
                const failure = this.toFailure(plan.selectedAction.intent, reason, context);
                const recovered = await engine.recover(failure);
                const succeeded = recovered.steps.length > 0 &&
                    recovered.steps.every((step) => step.status === 'succeeded');
                return deepFreeze({
                    id: nextId('recovery'),
                    schemaVersion: 1,
                    createdAt: nowIso(),
                    correlationId: context.correlationId,
                    source: '@irp/failover',
                    metadata: {
                        delegated: true,
                        attempted: true,
                        engineState: engine.getState(),
                        recoveryPlanId: recovered.id,
                        selectedActions: recovered.steps.map((step) => step.action),
                        stepStatuses: recovered.steps.map((step) => step.status),
                    },
                    delegatedTo: 'failover',
                    status: succeeded ? 'success' : recovered.steps.length === 0 ? 'degraded' : 'failed',
                    reason,
                });
            }
            catch (error) {
                return this.failed(context, `${reason}; canonical failover execution failed: ${error instanceof Error ? error.message : String(error)}`, true);
            }
        }
        const actionAdapter = this.adapters.findForAction(plan.selectedAction.intent, plan.requiredCapabilities);
        const recoveryAdapter = actionAdapter?.descriptor.recoverySupport && actionAdapter.rollback
            ? actionAdapter
            : this.adapters.findForAction('recovery', []);
        const rollbackSupported = Boolean(recoveryAdapter?.descriptor.recoverySupport && recoveryAdapter.rollback);
        if (!rollbackSupported)
            return this.failed(context, `${reason}; no executable failover rollback adapter is available`, false);
        try {
            const rollback = await recoveryAdapter.rollback(plan, context);
            const status = rollback.status === 'success' ? 'success' : 'failed';
            return deepFreeze({
                id: nextId('recovery'),
                schemaVersion: 1,
                createdAt: nowIso(),
                correlationId: context.correlationId,
                source: '@irp/failover-adapter',
                metadata: {
                    delegated: true,
                    attempted: true,
                    adapterId: recoveryAdapter.descriptor.adapterId,
                    rollbackExecutionId: rollback.id,
                    rollbackStatus: rollback.status,
                },
                delegatedTo: 'failover',
                status,
                reason,
            });
        }
        catch (error) {
            return this.failed(context, `${reason}; rollback failed: ${error instanceof Error ? error.message : String(error)}`, true);
        }
    }
    buildRecoveryAdapters(controlPlane) {
        return {
            connectivity: {
                getAvailableSources: () => controlPlane.connectivity.getAvailableSources(),
                switchSource: (resourceId, recoveryReason, trigger) => controlPlane.connectivity.switchSource(resourceId, canonicalTransitionReason(recoveryReason), canonicalTransitionTrigger(trigger)),
            },
            routing: {
                simulateRouting: (routingContext) => controlPlane.routing.simulateRouting(routingContext),
                applyPlan: (routingPlan) => controlPlane.routing.applyPlan(routingPlan),
            },
            validate: async (step) => step.status !== 'failed',
        };
    }
    toFailure(intent, reason, context) {
        const domain = this.failureDomain(intent);
        const severity = (domain === 'connectivity' ? 'critical' : 'major');
        return {
            id: nextId('failure'),
            domain,
            component: intent,
            type: 'transient',
            severity,
            confidence: 'high',
            confidenceScore: 95,
            detectedAt: nowIso(),
            source: 'resilience-runtime',
            evidence: [
                {
                    signalId: nextId('signal'),
                    source: 'resilience-runtime',
                    message: reason,
                    observedAt: nowIso(),
                    weight: 50,
                },
            ],
            impact: {
                affectedDomains: [domain],
                affectedComponents: [intent],
                downstreamComponents: ['resilience-runtime'],
                serviceImpact: 'degraded',
                estimatedBlastRadius: 0.5,
            },
            state: 'confirmed',
            correlationId: context.correlationId,
        };
    }
    failureDomain(intent) {
        switch (intent) {
            case 'connectivity_failover':
            case 'provider_switch':
                return 'connectivity';
            case 'route_change':
                return 'route';
            default:
                return 'platform';
        }
    }
    failed(context, reason, attempted) {
        return deepFreeze({
            id: nextId('recovery'),
            schemaVersion: 1,
            createdAt: nowIso(),
            correlationId: context.correlationId,
            source: '@irp/failover-adapter',
            metadata: { delegated: attempted, attempted },
            delegatedTo: 'failover',
            status: 'failed',
            reason,
        });
    }
}
//# sourceMappingURL=recovery.js.map