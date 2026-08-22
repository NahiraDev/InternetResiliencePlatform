import { describe, expect, it } from 'vitest';
import { createProbeKeyPair, ProbeFederation, signProbeEvidence } from './probe-federation.js';

const evidence = (probeId: string, status: 'reachable'|'degraded'|'unreachable' = 'reachable') => ({
  evidenceId: crypto.randomUUID(), probeId, region: 'ir-qazvin', observedAt: new Date().toISOString(), destination: 'example.test', serviceStatus: status,
  measurements: { latencyMs: 42, packetLossPercent: 0 },
});

describe('ProbeFederation', () => {
  it('accepts valid signed evidence and rejects replay', () => {
    const keys = createProbeKeyPair(); const federation = new ProbeFederation();
    federation.registerProbe({ probeId: 'probe-1', name: 'Qazvin', region: 'ir-qazvin', publicKeyPem: keys.publicKeyPem });
    const signed = signProbeEvidence(evidence('probe-1'), keys.privateKeyPem);
    expect(federation.ingest(signed).accepted).toBe(true);
    expect(federation.ingest(signed).reason).toBe('replayed-evidence');
  });
  it('rejects tampered evidence', () => {
    const keys = createProbeKeyPair(); const federation = new ProbeFederation();
    federation.registerProbe({ probeId: 'probe-1', name: 'Qazvin', region: 'ir-qazvin', publicKeyPem: keys.publicKeyPem });
    const signed = signProbeEvidence(evidence('probe-1'), keys.privateKeyPem);
    signed.payload.serviceStatus = 'unreachable';
    expect(federation.ingest(signed).reason).toBe('invalid-signature');
  });
  it('compares observations from multiple regions', () => {
    const a = createProbeKeyPair(), b = createProbeKeyPair(), federation = new ProbeFederation();
    federation.registerProbe({ probeId: 'probe-a', name: 'A', region: 'ir-qazvin', publicKeyPem: a.publicKeyPem });
    federation.registerProbe({ probeId: 'probe-b', name: 'B', region: 'de-frankfurt', publicKeyPem: b.publicKeyPem });
    federation.ingest(signProbeEvidence(evidence('probe-a', 'reachable'), a.privateKeyPem));
    federation.ingest(signProbeEvidence(evidence('probe-b', 'unreachable'), b.privateKeyPem));
    expect(federation.compareDestination('example.test').agreement).toBe('mixed');
  });
  it('rejects revoked probes', () => {
    const keys = createProbeKeyPair(), federation = new ProbeFederation();
    federation.registerProbe({ probeId: 'probe-1', name: 'A', region: 'ir-qazvin', publicKeyPem: keys.publicKeyPem });
    federation.revokeProbe('probe-1');
    expect(federation.ingest(signProbeEvidence(evidence('probe-1'), keys.privateKeyPem)).reason).toBe('revoked-probe');
  });
});
