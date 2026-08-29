import type { AgentRecommendation, InternetEvidence } from './types.js';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function analyzeInternetEvidence(
  current: InternetEvidence,
  history: readonly InternetEvidence[] = [],
): AgentRecommendation {
  const now = new Date().toISOString();
  const evidence: string[] = [];

  if (!current.gatewayReachable) {
    return recommendation('transport_failure', 'defer_to_decision_engine', 0.99, 'The local gateway is unreachable.', ['gateway-unreachable'], now);
  }
  if (!current.internetReachable) {
    if (current.dnsLookupMs === null) {
      return recommendation('dns_failure', 'prefer_resolver', 0.92, 'Internet reachability failed and DNS evidence is unavailable.', ['internet-unreachable', 'dns-unavailable'], now);
    }
    if (current.httpsHandshakeMs === null) {
      return recommendation('tls_failure', 'recheck_destination', 0.88, 'DNS evidence exists but HTTPS handshake evidence is unavailable.', ['dns-present', 'tls-unavailable'], now);
    }
    return recommendation('upstream_or_egress_issue', 'defer_to_decision_engine', 0.82, 'The gateway is reachable but the destination is not reachable.', ['gateway-reachable', 'internet-unreachable'], now);
  }

  if (current.packetLossRatio >= 0.2) {
    evidence.push(`packet-loss:${current.packetLossRatio.toFixed(3)}`);
    return recommendation('packet_loss', 'prefer_path', clamp(0.7 + current.packetLossRatio), 'Packet loss is materially elevated.', evidence, now);
  }
  if (current.httpsHandshakeMs === null && current.httpResponseMs !== null) {
    return recommendation('tls_failure', 'recheck_destination', 0.86, 'HTTP evidence exists without a successful TLS handshake.', ['http-present', 'tls-missing'], now);
  }
  if (current.dnsLookupMs !== null && current.dnsLookupMs >= 1500) {
    return recommendation('dns_failure', 'prefer_resolver', 0.84, 'DNS resolution latency is materially elevated.', [`dns-latency-ms:${current.dnsLookupMs}`], now);
  }
  if (current.latencyMs !== null && current.latencyMs >= 250) {
    evidence.push(`latency-ms:${current.latencyMs}`);
    return recommendation('latency_degradation', 'prefer_path', 0.8, 'End-to-end latency is materially elevated.', evidence, now);
  }
  if (current.ipv4Connectivity && !current.ipv6Connectivity) {
    return recommendation('ipv6_failure', 'defer_to_decision_engine', 0.78, 'IPv4 is healthy while IPv6 connectivity is unavailable.', ['ipv4-ok', 'ipv6-unavailable'], now);
  }

  const recent = history.slice(-5);
  const degraded = recent.filter((sample) => sample.qualityScore < 60).length;
  if (degraded >= 3) {
    return recommendation('possible_interference', 'defer_to_decision_engine', 0.76, 'Repeated degraded observations indicate a persistent path-specific problem; this is not proof of filtering.', ['persistent-degradation', `samples:${recent.length}`], now);
  }

  return recommendation('healthy', 'observe', 0.95, 'No material network anomaly was detected in the supplied evidence.', ['reachability-ok', 'loss-normal', 'latency-normal'], now);
}

function recommendation(
  diagnosis: AgentRecommendation['diagnosis'],
  kind: AgentRecommendation['kind'],
  confidence: number,
  rationale: string,
  evidence: string[],
  createdAt: string,
): AgentRecommendation {
  return { diagnosis, kind, confidence: clamp(confidence), rationale, evidence, generatedBy: 'deterministic', createdAt };
}
