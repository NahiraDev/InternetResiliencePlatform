export type ProbeStatus = 'active' | 'revoked';
export interface ProbeRegistration {
    probeId: string;
    name: string;
    region: string;
    publicKeyPem: string;
    createdAt: string;
    status: ProbeStatus;
    lastSeenAt?: string;
}
export interface ProbeEvidence {
    evidenceId: string;
    probeId: string;
    region: string;
    observedAt: string;
    destination: string;
    serviceStatus: 'reachable' | 'degraded' | 'unreachable' | 'unknown';
    measurements: {
        latencyMs?: number;
        jitterMs?: number;
        packetLossPercent?: number;
        dnsLatencyMs?: number;
        tcpLatencyMs?: number;
        tlsLatencyMs?: number;
        httpLatencyMs?: number;
    };
    metadata?: Record<string, string | number | boolean>;
}
export interface SignedProbeEvidence {
    payload: ProbeEvidence;
    signature: string;
}
export interface FederationLimits {
    maxEvidencePerProbe: number;
    maxEvidenceTotal: number;
    maxEvidenceAgeMs: number;
    maxClockSkewMs: number;
}
export interface FederationIngestResult {
    accepted: boolean;
    reason?: 'unknown-probe' | 'revoked-probe' | 'invalid-signature' | 'invalid-timestamp' | 'replayed-evidence' | 'capacity-limit';
    evidenceId: string;
}
export interface DestinationComparison {
    destination: string;
    observedAt: string;
    observations: Array<{
        probeId: string;
        region: string;
        serviceStatus: ProbeEvidence['serviceStatus'];
        measurements: ProbeEvidence['measurements'];
    }>;
    reachableCount: number;
    degradedCount: number;
    unreachableCount: number;
    agreement: 'consistent' | 'mixed' | 'insufficient';
}
export declare const createProbeKeyPair: () => {
    publicKeyPem: string;
    privateKeyPem: string;
};
export declare const signProbeEvidence: (payload: ProbeEvidence, privateKeyPem: string) => SignedProbeEvidence;
export declare class ProbeFederation {
    private readonly probes;
    private readonly evidence;
    private readonly perProbe;
    private readonly seen;
    private readonly keys;
    private readonly limits;
    constructor(limits?: Partial<FederationLimits>);
    registerProbe(input: Omit<ProbeRegistration, 'createdAt' | 'status'>): {
        probeId: string;
        name: string;
        region: string;
        publicKeyPem: string;
        createdAt: string;
        status: ProbeStatus;
        lastSeenAt?: string;
    };
    revokeProbe(id: string): boolean;
    listProbes(): {
        probeId: string;
        name: string;
        region: string;
        publicKeyPem: string;
        createdAt: string;
        status: ProbeStatus;
        lastSeenAt?: string;
    }[];
    ingest(s: SignedProbeEvidence, now?: number): FederationIngestResult;
    listEvidence(o?: {
        destination?: string;
        probeId?: string;
        limit?: number;
    }): {
        payload: {
            measurements: {
                latencyMs?: number;
                jitterMs?: number;
                packetLossPercent?: number;
                dnsLatencyMs?: number;
                tcpLatencyMs?: number;
                tlsLatencyMs?: number;
                httpLatencyMs?: number;
            };
            evidenceId: string;
            probeId: string;
            region: string;
            observedAt: string;
            destination: string;
            serviceStatus: "reachable" | "degraded" | "unreachable" | "unknown";
            metadata?: Record<string, string | number | boolean>;
        };
        signature: string;
    }[];
    compareDestination(destination: string, limit?: number): DestinationComparison;
    stats(): {
        probeCount: number;
        activeProbeCount: number;
        evidenceCount: number;
    };
    createLocalEvidence(input: Omit<ProbeEvidence, 'evidenceId'>): {
        evidenceId: `${string}-${string}-${string}-${string}-${string}`;
        metadata?: Record<string, string | number | boolean>;
        destination: string;
        region: string;
        serviceStatus: "reachable" | "degraded" | "unreachable" | "unknown";
        measurements: {
            latencyMs?: number;
            jitterMs?: number;
            packetLossPercent?: number;
            dnsLatencyMs?: number;
            tcpLatencyMs?: number;
            tlsLatencyMs?: number;
            httpLatencyMs?: number;
        };
        probeId: string;
        observedAt: string;
    };
}
//# sourceMappingURL=probe-federation.d.ts.map