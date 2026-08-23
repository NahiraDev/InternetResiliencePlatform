export type AddressFamily = 'ipv4' | 'ipv6';
export type IdentityConfidence = 'observed' | 'corroborated' | 'insufficient';
export type AssuranceStatus = 'compliant' | 'non-compliant' | 'insufficient-data';

export interface EgressIdentity {
  ip: string;
  family: AddressFamily;
  observedAt: string;
  source: string;
  asn?: number;
  organization?: string;
}

export interface DestinationIdentity {
  hostname: string;
  addresses: string[];
  protocol: 'http' | 'https' | 'tcp' | 'udp' | 'dns' | 'unknown';
  port?: number;
  observedAt: string;
  source: string;
}

export interface IdentityEvidence {
  egress: EgressIdentity;
  destination: DestinationIdentity;
  confidence: IdentityConfidence;
}

export interface IdentityPolicy {
  allowedEgressIps?: readonly string[];
  allowedEgressAsns?: readonly number[];
  allowedOrganizations?: readonly string[];
  allowedDestinationHostnames?: readonly string[];
  allowedDestinationAddresses?: readonly string[];
  requiredEgressSource?: string;
  maxEvidenceAgeMs?: number;
}

export interface AssuranceFinding {
  code:
    | 'stale-evidence'
    | 'egress-not-allowed'
    | 'destination-not-allowed'
    | 'egress-source-mismatch'
    | 'insufficient-confidence';
  message: string;
}

export interface IdentityAssuranceResult {
  status: AssuranceStatus;
  egress: EgressIdentity;
  destination: DestinationIdentity;
  findings: AssuranceFinding[];
  evaluatedAt: string;
}

const isNonEmpty = (value: string): boolean => value.trim().length > 0;
const normalizeHostname = (hostname: string): string => hostname.trim().toLowerCase().replace(/\.$/, '');
const unique = (values: readonly string[]): string[] => [...new Set(values.map((value) => value.trim()).filter(isNonEmpty))];

const validateEvidence = (evidence: IdentityEvidence): void => {
  if (!isNonEmpty(evidence.egress.ip)) throw new Error('egress ip is required');
  if (!isNonEmpty(evidence.egress.source)) throw new Error('egress source is required');
  if (!Number.isFinite(Date.parse(evidence.egress.observedAt))) throw new Error('egress observedAt must be a valid timestamp');
  if (!isNonEmpty(evidence.destination.hostname)) throw new Error('destination hostname is required');
  if (!isNonEmpty(evidence.destination.source)) throw new Error('destination source is required');
  if (!Number.isFinite(Date.parse(evidence.destination.observedAt))) throw new Error('destination observedAt must be a valid timestamp');
  if (evidence.destination.port !== undefined && (!Number.isInteger(evidence.destination.port) || evidence.destination.port < 1 || evidence.destination.port > 65535)) {
    throw new Error('destination port must be between 1 and 65535');
  }
};

export const assessIdentityPolicy = (
  evidence: IdentityEvidence | null,
  policy: IdentityPolicy,
  now = new Date(),
): IdentityAssuranceResult | {
  status: 'insufficient-data';
  egress: null;
  destination: null;
  findings: Array<{ code: 'missing-evidence'; message: string }>;
  evaluatedAt: string;
} => {
  const evaluatedAt = now.toISOString();
  if (!evidence) {
    return {
      status: 'insufficient-data',
      egress: null,
      destination: null,
      findings: [{ code: 'missing-evidence', message: 'independent egress and destination identity evidence is required' }],
      evaluatedAt,
    };
  }

  validateEvidence(evidence);
  const findings: AssuranceFinding[] = [];
  const egressAge = now.getTime() - Date.parse(evidence.egress.observedAt);
  const destinationAge = now.getTime() - Date.parse(evidence.destination.observedAt);
  const maxAge = policy.maxEvidenceAgeMs ?? 5 * 60_000;

  if (!Number.isFinite(maxAge) || maxAge < 0) throw new Error('maxEvidenceAgeMs must be a non-negative finite number');
  if (egressAge < 0 || destinationAge < 0 || egressAge > maxAge || destinationAge > maxAge) {
    findings.push({ code: 'stale-evidence', message: `identity evidence is outside the ${maxAge}ms freshness window` });
  }
  if (evidence.confidence === 'insufficient') {
    findings.push({ code: 'insufficient-confidence', message: 'evidence confidence is insufficient for policy assurance' });
  }

  if (policy.requiredEgressSource && evidence.egress.source !== policy.requiredEgressSource) {
    findings.push({ code: 'egress-source-mismatch', message: 'egress evidence source does not satisfy the required independent source' });
  }

  const allowedIps = unique(policy.allowedEgressIps ?? []);
  const allowedAsns = policy.allowedEgressAsns ?? [];
  const allowedOrganizations = unique(policy.allowedOrganizations ?? []);
  if (allowedIps.length > 0 || allowedAsns.length > 0 || allowedOrganizations.length > 0) {
    const ipMatch = allowedIps.includes(evidence.egress.ip);
    const asnMatch = evidence.egress.asn !== undefined && allowedAsns.includes(evidence.egress.asn);
    const organizationMatch = evidence.egress.organization !== undefined && allowedOrganizations.includes(evidence.egress.organization);
    if (!ipMatch && !asnMatch && !organizationMatch) {
      findings.push({ code: 'egress-not-allowed', message: 'observed egress identity does not satisfy the allowed egress policy' });
    }
  }

  const destinationHostname = normalizeHostname(evidence.destination.hostname);
  const allowedHostnames = unique(policy.allowedDestinationHostnames ?? []).map(normalizeHostname);
  const allowedAddresses = unique(policy.allowedDestinationAddresses ?? []);
  if (allowedHostnames.length > 0 || allowedAddresses.length > 0) {
    const hostnameMatch = allowedHostnames.includes(destinationHostname);
    const addressMatch = evidence.destination.addresses.some((address) => allowedAddresses.includes(address));
    if (!hostnameMatch && !addressMatch) {
      findings.push({ code: 'destination-not-allowed', message: 'observed destination identity does not satisfy the destination policy' });
    }
  }

  const blocking = findings.some((finding) => finding.code === 'egress-not-allowed' || finding.code === 'destination-not-allowed' || finding.code === 'egress-source-mismatch');
  const insufficient = findings.some((finding) => finding.code === 'stale-evidence' || finding.code === 'insufficient-confidence');

  return {
    status: blocking ? 'non-compliant' : insufficient ? 'insufficient-data' : 'compliant',
    egress: evidence.egress,
    destination: evidence.destination,
    findings,
    evaluatedAt,
  };
};
