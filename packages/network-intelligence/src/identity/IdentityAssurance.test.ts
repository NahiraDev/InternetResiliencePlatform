import { describe, expect, it } from 'vitest';
import {
  assessIdentityPolicy,
  type DestinationIdentity,
  type EgressIdentity,
  type IdentityEvidence,
} from './IdentityAssurance.js';

const now = new Date('2026-08-23T12:00:00.000Z');

type EvidenceOverrides = {
  egress?: Partial<EgressIdentity>;
  destination?: Partial<DestinationIdentity>;
  confidence?: IdentityEvidence['confidence'];
};

const evidence = (overrides: EvidenceOverrides = {}): IdentityEvidence => ({
  egress: {
    ip: '203.0.113.10',
    family: 'ipv4',
    observedAt: '2026-08-23T11:59:30.000Z',
    source: 'independent-egress-probe',
    asn: 64500,
    organization: 'Example Network',
    ...(overrides.egress ?? {}),
  },
  destination: {
    hostname: 'service.example',
    addresses: ['198.51.100.20'],
    protocol: 'https',
    port: 443,
    observedAt: '2026-08-23T11:59:35.000Z',
    source: 'destination-probe',
    ...(overrides.destination ?? {}),
  },
  confidence: overrides.confidence ?? 'corroborated',
});

describe('assessIdentityPolicy', () => {
  it('accepts independently observed egress and destination identities', () => {
    const result = assessIdentityPolicy(evidence(), {
      allowedEgressAsns: [64500],
      allowedDestinationHostnames: ['service.example'],
      requiredEgressSource: 'independent-egress-probe',
    }, now);

    expect(result.status).toBe('compliant');
    expect(result.findings).toEqual([]);
  });

  it('does not infer destination identity from egress identity', () => {
    const result = assessIdentityPolicy(evidence(), {
      allowedEgressIps: ['203.0.113.10'],
      allowedDestinationHostnames: ['different.example'],
    }, now);

    expect(result.status).toBe('non-compliant');
    expect(result.findings.map((finding) => finding.code)).toContain('destination-not-allowed');
  });

  it('rejects unauthorized egress even when destination is allowed', () => {
    const result = assessIdentityPolicy(evidence(), {
      allowedEgressAsns: [64501],
      allowedDestinationHostnames: ['service.example'],
    }, now);

    expect(result.status).toBe('non-compliant');
    expect(result.findings.map((finding) => finding.code)).toContain('egress-not-allowed');
  });

  it('requires the configured independent evidence source', () => {
    const result = assessIdentityPolicy(evidence({ egress: { source: 'local-observer' } }), {
      requiredEgressSource: 'independent-egress-probe',
    }, now);

    expect(result.status).toBe('non-compliant');
    expect(result.findings.map((finding) => finding.code)).toContain('egress-source-mismatch');
  });

  it('does not silently accept stale evidence', () => {
    const result = assessIdentityPolicy(evidence({ egress: { observedAt: '2026-08-23T11:00:00.000Z' } }), {
      maxEvidenceAgeMs: 60_000,
    }, now);

    expect(result.status).toBe('insufficient-data');
    expect(result.findings.map((finding) => finding.code)).toContain('stale-evidence');
  });

  it('treats insufficient confidence as insufficient data', () => {
    const result = assessIdentityPolicy(evidence({ confidence: 'insufficient' }), {}, now);

    expect(result.status).toBe('insufficient-data');
    expect(result.findings.map((finding) => finding.code)).toContain('insufficient-confidence');
  });

  it('supports address-level destination policy', () => {
    const result = assessIdentityPolicy(evidence(), {
      allowedDestinationAddresses: ['198.51.100.20'],
    }, now);

    expect(result.status).toBe('compliant');
  });

  it('rejects invalid destination ports', () => {
    expect(() => assessIdentityPolicy(evidence({ destination: { port: 70000 } }), {}, now)).toThrow('destination port');
  });

  it('reports missing evidence explicitly', () => {
    const result = assessIdentityPolicy(null, {}, now);

    expect(result.status).toBe('insufficient-data');
    expect(result.findings.map((finding) => finding.code)).toEqual(['missing-evidence']);
  });
});
