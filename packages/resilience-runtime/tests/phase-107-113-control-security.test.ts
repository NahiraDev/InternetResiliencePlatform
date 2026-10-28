import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AgentSessionVerifier, CapabilityGrantStore, DEFAULT_SECURITY_RULES, DeviceEnrollmentLedger, EnrollmentError, GrantError,
  KeyLifecycleError, KeyLifecycleManager, SecurityMonitor, actorFromGrants, assessControlChannel,
  assessControlPlane, deriveSessionKey, enrollmentProofMessage, evaluateSecurityPolicy, isPrivilegedMutationMessage,
  issueEnrollmentToken, sealEnvelope, toSecurityGateInput, verifyEnrollmentToken,
  type ControlChannelDescriptor, type SecurityContainmentPort, type SecurityRequestContext,
} from '../src/index.js';

import { TrustBoundaryAuthorizer } from '../src/security/trust-boundaries.js';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');

const channel = (o: Partial<ControlChannelDescriptor> = {}): ControlChannelDescriptor => ({
  id: 'agent-1', kind: 'agent', boundary: 'remote-node', tls: 'TLS1.3', mutualAuth: true, messageSigning: true, replayProtection: true,
  authenticatedPrincipal: true, maxMessageBytes: 65_536, requestsPrivilegedMutation: false, ...o,
});

describe('Phase 107 — secure control-plane architecture', () => {
  it('accepts a compliant agent channel and fails weak ones closed', () => {
    expect(assessControlChannel(channel()).compliant).toBe(true);
    const weak = assessControlChannel(channel({ tls: 'TLS1.2', mutualAuth: false, messageSigning: false, replayProtection: false }));
    expect(weak.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['tls-too-weak', 'mutual-auth-missing', 'message-signing-missing', 'replay-protection-missing']));
    expect(weak.compliant).toBe(false);
  });
  it('forbids privileged mutation from remote/plugin boundaries and validates the plane', () => {
    const bad = assessControlChannel(channel({ requestsPrivilegedMutation: true }));
    expect(bad.findings.some((f) => f.code === 'privileged-mutation-from-untrusted-boundary')).toBe(true);
    expect(assessControlPlane([]).secure).toBe(false);
    expect(assessControlPlane([channel(), channel()]).reasons[0]).toContain('duplicate-channel-ids');
    expect(assessControlPlane([channel(), channel({ id: 'int', kind: 'internal', boundary: 'canonical-runtime', tls: 'none', mutualAuth: false, messageSigning: false, replayProtection: false })]).secure).toBe(true);
    expect(assessControlChannel(channel({ id: 'i', kind: 'internal', boundary: 'plugin', tls: 'none' })).findings.some((f) => f.code === 'internal-channel-boundary')).toBe(true);
  });
});

describe('Phase 108 — device identity & enrollment', () => {
  const secret = 'enrollment-secret';
  const device = () => { const { publicKey, privateKey } = generateKeyPairSync('ed25519'); return { privateKey, pem: publicKey.export({ type: 'spki', format: 'pem' }).toString() }; };
  const token = (over: Partial<{ expiresAtMs: number }> = {}) => issueEnrollmentToken(secret, { tenantId: 't1', issuedAtMs: NOW, expiresAtMs: NOW + 60_000, maxTrust: 'standard', ...over });
  const proofFor = (tok: string, deviceId: string, key: ReturnType<typeof device>['privateKey']) => cryptoSign(null, enrollmentProofMessage(verifyEnrollmentToken(secret, tok, NOW).tokenId, deviceId), key);

  it('enrolls with a valid token and proof, and burns the token', () => {
    const ledger = new DeviceEnrollmentLedger(secret);
    const d = device(); const t = token();
    const id = ledger.enroll({ token: t, deviceId: 'dev-1', publicKeyPem: d.pem, proofSignature: proofFor(t, 'dev-1', d.privateKey), nowMs: NOW });
    expect(id).toMatchObject({ state: 'enrolled', tenantId: 't1' });
    expect(ledger.isTrusted('dev-1')).toBe(true);
    const d2 = device();
    expect(() => ledger.enroll({ token: t, deviceId: 'dev-2', publicKeyPem: d2.pem, proofSignature: proofFor(t, 'dev-2', d2.privateKey), nowMs: NOW })).toThrow(/token-already-used/);
  });
  it('rejects forged, expired and unproven enrollments', () => {
    const ledger = new DeviceEnrollmentLedger(secret);
    const d = device(); const other = device();
    const t = token();
    expect(() => verifyEnrollmentToken('wrong', t, NOW)).toThrow(/bad-token-signature/);
    expect(() => verifyEnrollmentToken(secret, t, NOW + 120_000)).toThrow(/token-expired/);
    expect(() => verifyEnrollmentToken(secret, 'a.b.c', NOW)).toThrow(EnrollmentError);
    expect(() => ledger.enroll({ token: t, deviceId: 'x', publicKeyPem: d.pem, proofSignature: proofFor(t, 'x', other.privateKey), nowMs: NOW })).toThrow(/proof-of-possession-failed/);
    expect(() => ledger.enroll({ token: t, deviceId: 'x', publicKeyPem: 'garbage', proofSignature: Buffer.alloc(64), nowMs: NOW })).toThrow(/invalid-public-key/);
    expect(() => issueEnrollmentToken(secret, { tenantId: 't', issuedAtMs: NOW, expiresAtMs: NOW, maxTrust: 'standard' })).toThrow(/lifetime/);
  });
  it('enforces the trust state machine and untrusts suspended or revoked devices', () => {
    const ledger = new DeviceEnrollmentLedger(secret);
    const d = device(); const t = token();
    ledger.enroll({ token: t, deviceId: 'dev', publicKeyPem: d.pem, proofSignature: proofFor(t, 'dev', d.privateKey), nowMs: NOW });
    ledger.transition('dev', 'suspended', 'anomaly', NOW + 1);
    expect(ledger.isTrusted('dev')).toBe(false);
    ledger.transition('dev', 'enrolled', 'cleared', NOW + 2);
    ledger.transition('dev', 'revoked', 'compromised', NOW + 3);
    expect(() => ledger.transition('dev', 'enrolled', 'again', NOW + 4)).toThrow(/illegal-transition/);
    expect(ledger.get('dev')?.history).toHaveLength(4);
    expect(ledger.list('t1')).toHaveLength(1);
  });
});

describe('Phase 109 — authorization / capability model', () => {
  const base = { grantId: 'g1', subject: 'alice', capability: 'observe.read', effect: 'allow' as const, scope: { tenantId: 't1' }, expiresAtMs: NOW + 10_000, delegable: true };
  it('evaluates deny-wins, scope and expiry', () => {
    const s = new CapabilityGrantStore();
    s.add(base);
    s.add({ ...base, grantId: 'g2', capability: 'observe.read', effect: 'deny', scope: { tenantId: 't1', resourceId: 'secret' }, delegable: false });
    expect(s.authorize({ subject: 'alice', capability: 'observe.read', scope: { tenantId: 't1', resourceId: 'r' }, nowMs: NOW })).toMatchObject({ allowed: true });
    expect(s.authorize({ subject: 'alice', capability: 'observe.read', scope: { tenantId: 't1', resourceId: 'secret' }, nowMs: NOW })).toMatchObject({ allowed: false, reason: 'explicit-deny' });
    expect(s.authorize({ subject: 'alice', capability: 'observe.read', scope: { tenantId: 't2' }, nowMs: NOW }).reason).toBe('no-matching-grant');
    expect(s.authorize({ subject: 'alice', capability: 'observe.read', scope: { tenantId: 't1' }, nowMs: NOW + 20_000 }).allowed).toBe(false);
  });
  it('attenuates delegation and cascades revocation', () => {
    const s = new CapabilityGrantStore();
    s.add({ ...base, capability: 'probe.*' });
    expect(() => s.add({ ...base, grantId: 'c1', subject: 'bob', capability: 'network.mutate', parentGrantId: 'g1' })).toThrow(/exceeds-capability/);
    expect(() => s.add({ ...base, grantId: 'c2', subject: 'bob', capability: 'probe.remote', scope: { tenantId: 't2' }, parentGrantId: 'g1' })).toThrow(/exceeds-scope/);
    expect(() => s.add({ ...base, grantId: 'c3', subject: 'bob', capability: 'probe.remote', expiresAtMs: NOW + 99_000, parentGrantId: 'g1' })).toThrow(/exceeds-lifetime/);
    s.add({ ...base, grantId: 'c4', subject: 'bob', capability: 'probe.remote', parentGrantId: 'g1', delegable: false });
    expect(s.authorize({ subject: 'bob', capability: 'probe.remote', scope: { tenantId: 't1' }, nowMs: NOW }).allowed).toBe(true);
    expect(s.revoke('g1')).toEqual(['c4', 'g1']);
    expect(s.authorize({ subject: 'bob', capability: 'probe.remote', scope: { tenantId: 't1' }, nowMs: NOW }).allowed).toBe(false);
    expect(() => s.add({ ...base, grantId: 'g1' })).toThrow(GrantError);
  });
  it('projects grants onto the existing authorizer without exceeding boundary ceilings', () => {
    const s = new CapabilityGrantStore();
    s.add({ ...base, subject: 'plugin-x', capability: 'network.mutate' });
    const actor = actorFromGrants(s, { actorId: 'plugin-x', boundary: 'plugin', verified: true, nowMs: NOW, scope: { tenantId: 't1' } });
    expect(actor.grantedCapabilities).toEqual(['network.mutate']);
    expect(new TrustBoundaryAuthorizer().authorize(actor, ['network.mutate']).allowed).toBe(false);
  });
});

describe('Phase 110 — secrets & key lifecycle', () => {
  const day = 24 * 3_600_000;
  it('seals, opens and binds ciphertext to key, version and aad', () => {
    const m = new KeyLifecycleManager();
    m.create('k', NOW);
    const env = m.seal('k', 'top-secret', 'ctx');
    expect(m.open(env, 'ctx').toString()).toBe('top-secret');
    expect(() => m.open(env, 'other')).toThrow(/decryption-failed/);
    expect(() => m.open({ ...env, ciphertext: Buffer.from('xx').toString('base64') }, 'ctx')).toThrow(KeyLifecycleError);
    expect(JSON.stringify(m.describe('k'))).not.toContain('material');
  });
  it('rotates with overlap, retires, destroys and reseals', () => {
    const m = new KeyLifecycleManager({ maxAgeMs: 30 * day, overlapMs: day, destroyAfterMs: 10 * day });
    m.create('k', NOW);
    const old = m.seal('k', 'data');
    expect(m.dueForRotation(NOW + 31 * day)).toEqual(['k']);
    m.rotate('k', NOW + 31 * day);
    expect(m.open(old).toString()).toBe('data');
    const resealed = m.reseal(old);
    expect(resealed.version).toBe(2);
    m.tick(NOW + 33 * day);
    expect(() => m.open(old)).toThrow(/key-unavailable/);
    expect(m.open(resealed).toString()).toBe('data');
    m.tick(NOW + 50 * day);
    expect(m.describe('k').map((d) => d.state)).toEqual(['destroyed', 'active']);
  });
  it('revokes immediately and validates policy', () => {
    const m = new KeyLifecycleManager();
    m.create('k', NOW);
    const env = m.seal('k', 'x');
    m.revoke('k', 1, NOW);
    expect(() => m.open(env)).toThrow(/key-unavailable/);
    expect(() => m.seal('k', 'y')).toThrow(/no-active-key/);
    expect(() => m.create('k', NOW)).toThrow(/key-exists/);
    expect(() => new KeyLifecycleManager({ maxAgeMs: 0, overlapMs: 0, destroyAfterMs: 1 })).toThrow(/invalid-policy/);
  });
});

describe('Phase 111 — secure agent protocol', () => {
  const key = deriveSessionKey('device-secret', 's1', 'agent-to-control');
  const make = (seq: number, nonce: string, over: Record<string, unknown> = {}) =>
    sealEnvelope(key, { sessionId: 's1', deviceId: 'd', direction: 'agent-to-control', type: 'heartbeat', sequence: seq, nonce, sentAtMs: NOW, body: '{}', ...over } as Parameters<typeof sealEnvelope>[1]);
  it('accepts valid ordered messages and rejects replay, regression, tampering and skew', () => {
    const v = new AgentSessionVerifier('s1', 'agent-to-control', key);
    expect(v.verify(make(1, 'n1'), NOW)).toEqual({ accepted: true });
    expect(v.verify(make(1, 'n1'), NOW).reason).toBe('replayed-nonce');
    expect(v.verify(make(1, 'n2'), NOW).reason).toBe('sequence-regression');
    expect(v.verify({ ...make(2, 'n3'), body: '{"x":1}' }, NOW).reason).toBe('bad-mac');
    expect(v.verify(make(3, 'n4', { sentAtMs: NOW - 120_000 }), NOW).reason).toBe('clock-skew');
    expect(v.verify(make(4, 'n5'), NOW)).toEqual({ accepted: true });
  });
  it('enforces direction allow-lists, key separation and size limits', () => {
    expect(() => sealEnvelope(key, { sessionId: 's1', deviceId: 'd', direction: 'agent-to-control', type: 'config-push', sequence: 1, nonce: 'n', sentAtMs: NOW, body: '' })).toThrow(/not allowed/);
    const wrongKey = new AgentSessionVerifier('s1', 'agent-to-control', deriveSessionKey('other-secret', 's1', 'agent-to-control'));
    expect(wrongKey.verify(make(1, 'n1'), NOW).reason).toBe('bad-mac');
    const small = new AgentSessionVerifier('s1', 'agent-to-control', key, { maxBodyBytes: 4 });
    expect(small.verify(make(1, 'n1', { body: 'too large body' }), NOW).reason).toBe('body-too-large');
    expect(new AgentSessionVerifier('other', 'agent-to-control', key).verify(make(1, 'n1'), NOW).reason).toBe('unknown-session');
    expect(deriveSessionKey('device-secret', 's1', 'control-to-agent').equals(key)).toBe(false);
    expect(isPrivilegedMutationMessage('command-request')).toBe(false);
  });
  it('bounds the nonce cache', () => {
    const v = new AgentSessionVerifier('s1', 'agent-to-control', key, { nonceCacheSize: 2 });
    for (let i = 1; i <= 4; i += 1) expect(v.verify(make(i, `n${i}`), NOW).accepted).toBe(true);
  });
});

describe('Phase 112 — security policy & enforcement', () => {
  const ctx = (o: Partial<SecurityRequestContext> = {}): SecurityRequestContext => ({ actorId: 'a', boundary: 'canonical-runtime', capability: 'network.mutate', risk: 0.2, deviceTrusted: true, mode: 'live', nowMs: NOW, ...o });
  it('applies ordered rules with default deny', () => {
    expect(evaluateSecurityPolicy(DEFAULT_SECURITY_RULES, ctx()).effect).toBe('allow');
    expect(evaluateSecurityPolicy(DEFAULT_SECURITY_RULES, ctx({ deviceTrusted: false })).ruleId).toBe('deny-untrusted-device-mutation');
    expect(evaluateSecurityPolicy(DEFAULT_SECURITY_RULES, ctx({ boundary: 'ai' })).effect).toBe('deny');
    expect(evaluateSecurityPolicy(DEFAULT_SECURITY_RULES, ctx({ capability: 'unknown.thing' })).reasons).toEqual(['default-deny']);
  });
  it('requires approval for high risk and honours a recorded approval', () => {
    expect(evaluateSecurityPolicy(DEFAULT_SECURITY_RULES, ctx({ risk: 0.9 })).effect).toBe('require-approval');
    expect(evaluateSecurityPolicy(DEFAULT_SECURITY_RULES, ctx({ risk: 0.9, approved: true })).effect).toBe('allow');
  });
  it('fails closed on duplicate rule ids and adapts to the boundary gate input', () => {
    expect(evaluateSecurityPolicy([...DEFAULT_SECURITY_RULES, DEFAULT_SECURITY_RULES[0]!], ctx()).effect).toBe('deny');
    const authz = new TrustBoundaryAuthorizer().authorize({ actorId: 'rt', boundary: 'canonical-runtime', verified: true, grantedCapabilities: ['network.mutate'] }, ['network.mutate']);
    expect(authz.allowed).toBe(true);
    expect(toSecurityGateInput(evaluateSecurityPolicy(DEFAULT_SECURITY_RULES, ctx()), authz).authorization.allowed).toBe(true);
    const denied = toSecurityGateInput(evaluateSecurityPolicy(DEFAULT_SECURITY_RULES, ctx({ risk: 0.9 })), authz);
    expect(denied.authorization.allowed).toBe(false);
    expect(denied.reasons).toContain('security-policy:require-approval');
  });
});

describe('Phase 113 — security monitoring & automated response', () => {
  const port = () => {
    const calls: string[] = [];
    const p: SecurityContainmentPort = {
      suspendDevice: (id) => { calls.push(`suspend:${id}`); },
      revokeSubjectGrants: (s) => { calls.push(`revoke:${s}`); },
      raiseAlert: (f) => { calls.push(`alert:${f.rule}`); },
    };
    return { p, calls };
  };
  it('contains an auth-failure burst once and respects the cooldown', async () => {
    const { p, calls } = port();
    const m = new SecurityMonitor(p);
    for (let i = 0; i < 4; i += 1) expect(await m.ingest({ kind: 'auth-failure', subject: 'u', deviceId: 'd1', atMs: NOW + i })).toHaveLength(0);
    const fifth = await m.ingest({ kind: 'auth-failure', subject: 'u', deviceId: 'd1', atMs: NOW + 5 });
    expect(fifth.map((r) => r.status)).toEqual(['applied', 'applied']);
    expect(calls).toEqual(['suspend:d1', 'alert:auth-failure-burst']);
    const sixth = await m.ingest({ kind: 'auth-failure', subject: 'u', deviceId: 'd1', atMs: NOW + 6 });
    expect(sixth.every((r) => r.status === 'suppressed-cooldown')).toBe(true);
    expect(calls).toHaveLength(2);
  });
  it('responds immediately to revoked-identity use and records failures without throwing', async () => {
    const { p, calls } = port();
    const m = new SecurityMonitor(p);
    expect((await m.ingest({ kind: 'revoked-identity-used', subject: 'ghost', atMs: NOW }))[0]?.status).toBe('applied');
    expect(calls).toEqual(['alert:revoked-identity-use']);
    const failing = new SecurityMonitor({ ...p, suspendDevice: () => { throw new Error('store down'); } });
    for (let i = 0; i < 5; i += 1) await failing.ingest({ kind: 'bad-signature', subject: 'v', deviceId: 'd2', atMs: NOW + i });
    expect(failing.auditTrail().some((r) => r.status === 'failed' && r.detail === 'store down')).toBe(true);
  });
  it('limits containment through a response budget and needs a device for suspension', async () => {
    const { p, calls } = port();
    const m = new SecurityMonitor(p, undefined, { maxResponsesPerWindow: 1, cooldownMs: 0 });
    for (let i = 0; i < 15; i += 1) await m.ingest({ kind: 'capability-denied', subject: 'probe', atMs: NOW + i });
    expect(calls.filter((c) => c.startsWith('revoke')).length).toBe(1);
    expect(m.auditTrail().some((r) => r.status === 'suppressed-budget')).toBe(true);
    const noDevice = new SecurityMonitor(p, undefined, { cooldownMs: 0 });
    for (let i = 0; i < 5; i += 1) await noDevice.ingest({ kind: 'auth-failure', subject: 'nd', atMs: NOW + i });
    expect(noDevice.auditTrail().some((r) => r.status === 'failed' && r.detail === 'no-device-id')).toBe(true);
  });
});
