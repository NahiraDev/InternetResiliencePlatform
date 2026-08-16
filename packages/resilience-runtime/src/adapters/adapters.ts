import type { CandidateAction, Incident, RuntimeContext } from '../domain/types.js';
import type { DecisionProvider } from '../ports/ports.js';
import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
export class SubsystemDecisionAdapter implements DecisionProvider {
  async decide(
    incidents: readonly Incident[],
    context: RuntimeContext,
  ): Promise<readonly CandidateAction[]> {
    if (!incidents.length) return [this.candidate('noop', context, 1, 0, 1, [])];
    return incidents.map((i) =>
      i.classification === 'security_failure'
        ? this.candidate('degraded_mode', context, 0.4, 0.1, i.confidence, [])
        : i.rootCause.includes('dns')
          ? this.candidate('dns_switch', context, 0.8, 0.3, i.confidence, ['dns.write'])
          : this.candidate('health_reprobe', context, 0.2, 0.05, i.confidence, []),
    );
  }
  private candidate(
    intent: CandidateAction['intent'],
    context: RuntimeContext,
    benefit: number,
    risk: number,
    confidence: number,
    caps: readonly string[],
  ): CandidateAction {
    return deepFreeze({
      id: nextId('candidate'),
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      source: 'subsystem-decision-adapter',
      metadata: { delegated: true },
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
