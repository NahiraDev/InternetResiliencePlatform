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
    code: 'missing-evidence' | 'stale-evidence' | 'egress-not-allowed' | 'destination-not-allowed' | 'egress-source-mismatch' | 'insufficient-confidence';
    message: string;
}
export interface IdentityAssuranceResult {
    status: AssuranceStatus;
    egress: EgressIdentity | null;
    destination: DestinationIdentity | null;
    findings: AssuranceFinding[];
    evaluatedAt: string;
}
export declare const assessIdentityPolicy: (evidence: IdentityEvidence | null, policy: IdentityPolicy, now?: Date) => IdentityAssuranceResult;
//# sourceMappingURL=IdentityAssurance.d.ts.map