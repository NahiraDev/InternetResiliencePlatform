import { InternetIntelligenceAgent, type AgentRecommendation } from '@irp/internet-intelligence-agent';
import {
  InternetIntelligenceBridge,
  NetworkDecisionEngine,
  type DecisionType,
  type InternetEvidence,
} from '@irp/network-intelligence';
import { SubsystemDecisionAdapter } from './adapters/adapters.js';
import { nextId, nowIso } from './domain/ids.js';
import type { CandidateAction, Incident, ObservationBatch, RuntimeContext } from './domain/types.js';
import type { DecisionProvider } from './ports/ports.js';

/**
 * Production decision boundary for the resilience runtime.
 *
 * The agent is advisory: it diagnoses evidence and biases candidate quality.
 * NetworkDecisionEngine remains the ranking authority; policy, capability,
 * security, validation, execution, verification, and recovery remain outside
 * this provider and cannot be bypassed by the agent.
 */
export class CanonicalDecisionProvider implements DecisionProvider {
  private readonly subsystem = new SubsystemDecisionAdapter();
  private readonly engine: NetworkDecisionEngine;
  private readonly bridge: InternetIntelligenceBridge;

  constructor(
    agent = new InternetIntelligenceAgent(),
    options: { agentTimeoutMs?: number; decisionTimeoutMs?: number } = {},
  ) {
    this.engine = new NetworkDecisionEngine({
      model: { timeoutMs: options.decisionTimeoutMs ?? 250, maxConcurrent: 1 },
    });
    this.bridge = new InternetIntelligenceBridge(agent, {
      timeoutMs: options.agentTimeoutMs ?? 250,
    });
  }

  async decide(
    incidents: readonly Incident[],
    context: RuntimeContext,
  ): Promise<readonly CandidateAction[]> {
    const candidates = await this.subsystem.decide(incidents, context);
    if (!incidents.length || !context.observationSnapshot) return candidates;

    const internetEvidence = toInternetEvidence(context.observationSnapshot);
    const recommendation = await this.bridge.analyze({
      timestamp: context.observationSnapshot.createdAt,
      versions: {
        policyVersion: context.policySnapshot.schemaVersion.toString(),
        networkStateVersion: context.observationSnapshot.schemaVersion.toString(),
        securityStateVersion: context.securityContext.trusted ? 'trusted' : 'untrusted',
      },
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        type: candidateType(candidate.intent),
        capabilities: candidate.requiredCapabilities,
        health: candidate.rejectionReasons.length ? 'unhealthy' : 'healthy',
        metrics: {
          recoveryCost: candidate.risk,
          availabilityRatio: candidate.expectedBenefit,
        },
        policyCompatibility: candidate.rejectionReasons.length === 0,
        securityCompatibility: context.securityContext.trusted,
        timestamp: candidate.createdAt,
        metadata: { runtimeIntent: candidate.intent },
      })),
      internetEvidence,
    });

    const intelligenceAdjusted = ensureRecommendedCandidate(
      applyRecommendation(candidates, recommendation),
      recommendation,
      context,
    );
    const decision = await this.engine.evaluate({
      type: decisionType(intelligenceAdjusted[0]?.intent),
      context: {
        timestamp: context.observationSnapshot.createdAt,
        versions: {
          policyVersion: context.policySnapshot.schemaVersion.toString(),
          networkStateVersion: context.observationSnapshot.schemaVersion.toString(),
          securityStateVersion: context.securityContext.trusted ? 'trusted' : 'untrusted',
        },
        candidates: intelligenceAdjusted.map((candidate) => ({
          id: candidate.id,
          type: candidateType(candidate.intent),
          capabilities: candidate.requiredCapabilities,
          health: candidate.rejectionReasons.length ? 'unhealthy' : 'healthy',
          metrics: {
            recoveryCost: candidate.risk,
            availabilityRatio: candidate.expectedBenefit,
          },
          policyCompatibility: candidate.rejectionReasons.length === 0,
          securityCompatibility: context.securityContext.trusted,
          timestamp: candidate.createdAt,
          metadata: { runtimeIntent: candidate.intent },
        })),
        historicalObservations: {},
        requiredCapabilities: context.capabilitySnapshot.capabilities,
      },
    });

    const selectedId = decision.selectedCandidate?.id;
    if (!selectedId) return intelligenceAdjusted;
    const selected = intelligenceAdjusted.find((candidate) => candidate.id === selectedId);
    if (!selected) return intelligenceAdjusted;
    return [selected, ...intelligenceAdjusted.filter((candidate) => candidate.id !== selectedId)];
  }
}

const candidateType = (intent: CandidateAction['intent']) => {
  switch (intent) {
    case 'dns_switch':
      return 'dns-resolver' as const;
    case 'connectivity_failover':
    case 'provider_switch':
      return 'connectivity-source' as const;
    case 'route_change':
      return 'route' as const;
    case 'tunnel_switch':
      return 'tunnel' as const;
    default:
      return 'route' as const;
  }
};

const decisionType = (intent: CandidateAction['intent'] | undefined): DecisionType => {
  switch (intent) {
    case 'dns_switch':
      return 'dnsDecision';
    case 'connectivity_failover':
    case 'provider_switch':
      return 'failoverDecision';
    case 'route_change':
      return 'routeDecision';
    case 'tunnel_switch':
      return 'tunnelDecision';
    default:
      return 'connectivityDecision';
  }
};

const preferredIntent = (recommendation: AgentRecommendation): CandidateAction['intent'] | null => {
  switch (recommendation.diagnosis) {
    case 'dns_failure':
      return 'dns_switch';
    case 'packet_loss':
    case 'latency_degradation':
      return 'route_change';
    case 'transport_failure':
    case 'upstream_or_egress_issue':
    case 'ipv6_failure':
      return 'connectivity_failover';
    case 'tls_failure':
      return 'health_reprobe';
    default:
      return null;
  }
};

const requiredCapabilities = (intent: CandidateAction['intent']): readonly string[] => {
  switch (intent) {
    case 'dns_switch':
      return ['dns.write'];
    case 'route_change':
      return ['route.write'];
    case 'connectivity_failover':
      return ['connectivity.failover'];
    case 'tunnel_switch':
      return ['tunnel.write'];
    case 'health_reprobe':
      return ['network.observe'];
    default:
      return [];
  }
};

const applyRecommendation = (
  candidates: readonly CandidateAction[],
  recommendation: AgentRecommendation | null,
): readonly CandidateAction[] => {
  if (!recommendation || recommendation.confidence < 0.65) return candidates;
  const preferred = preferredIntent(recommendation);
  if (!preferred) return candidates;

  return candidates.map((candidate) =>
    candidate.intent === preferred
      ? {
          ...candidate,
          confidence: Math.max(candidate.confidence, recommendation.confidence),
          risk: Math.min(candidate.risk, Math.max(0, 1 - recommendation.confidence)),
          metadata: {
            ...candidate.metadata,
            intelligence: {
              diagnosis: recommendation.diagnosis,
              confidence: recommendation.confidence,
              generatedBy: recommendation.generatedBy,
              evidence: recommendation.evidence,
            },
          },
        }
      : candidate,
  );
};

const ensureRecommendedCandidate = (
  candidates: readonly CandidateAction[],
  recommendation: AgentRecommendation | null,
  context: RuntimeContext,
): readonly CandidateAction[] => {
  if (!recommendation || recommendation.confidence < 0.65) return candidates;
  const preferred = preferredIntent(recommendation);
  if (!preferred || candidates.some((candidate) => candidate.intent === preferred)) return candidates;

  const confidence = Math.max(0.65, Math.min(1, recommendation.confidence));
  const candidate: CandidateAction = {
    id: nextId('candidate'),
    schemaVersion: 1,
    createdAt: nowIso(),
    correlationId: context.correlationId,
    source: 'internet-intelligence-agent',
    metadata: {
      synthesized: true,
      intelligence: {
        diagnosis: recommendation.diagnosis,
        confidence,
        generatedBy: recommendation.generatedBy,
        evidence: recommendation.evidence,
      },
    },
    intent: preferred,
    expectedBenefit: confidence,
    risk: Math.max(0, 1 - confidence),
    confidence,
    requiredCapabilities: requiredCapabilities(preferred),
    dependencies: [preferred],
    postconditions: [`${preferred} verified`],
    verificationRequirements: [`${preferred} postcondition`],
    rollbackStrategy: preferred === 'connectivity_failover' ? 'restore-previous-source' : undefined,
    rejectionReasons: [],
  };
  return [...candidates, candidate];
};

const metric = (batch: ObservationBatch, names: readonly string[]): number | null => {
  for (const name of names) {
    const observation = batch.observations.find((item) => item.metric === name);
    if (typeof observation?.value === 'number' && Number.isFinite(observation.value)) return observation.value;
  }
  return null;
};

const booleanMetric = (batch: ObservationBatch, names: readonly string[], fallback: boolean): boolean => {
  for (const name of names) {
    const observation = batch.observations.find((item) => item.metric === name);
    if (typeof observation?.value === 'boolean') return observation.value;
  }
  return fallback;
};

const toInternetEvidence = (batch: ObservationBatch): InternetEvidence => {
  const gatewayReachable = booleanMetric(batch, ['gateway_reachable', 'linux_interfaces_available'], true);
  const internetReachable = booleanMetric(batch, ['internet_reachable'], gatewayReachable);
  const ipv4Connectivity = booleanMetric(batch, ['ipv4_connectivity'], gatewayReachable);
  const ipv6Connectivity = booleanMetric(batch, ['ipv6_connectivity'], ipv4Connectivity);
  const latencyMs = metric(batch, ['latency_ms', 'network_latency_ms']);
  const packetLossRatio = metric(batch, ['packet_loss_ratio', 'packet_loss']) ?? 0;
  const dnsLookupMs = metric(batch, ['dns_lookup_ms', 'dns_latency_ms']);
  const httpResponseMs = metric(batch, ['http_response_ms', 'http_latency_ms']);
  const httpsHandshakeMs = metric(batch, ['https_handshake_ms', 'tls_handshake_ms']);
  const qualityScore = metric(batch, ['quality_score', 'network_quality_score']) ??
    Math.max(0, Math.min(100, 100 - (latencyMs ?? 0) / 5 - packetLossRatio * 100));

  return {
    timestamp: batch.createdAt,
    latencyMs,
    jitterMs: metric(batch, ['jitter_ms', 'network_jitter_ms']),
    packetLossRatio,
    dnsLookupMs,
    httpResponseMs,
    httpsHandshakeMs,
    ipv4Connectivity,
    ipv6Connectivity,
    gatewayReachable,
    internetReachable,
    qualityScore,
  };
};
