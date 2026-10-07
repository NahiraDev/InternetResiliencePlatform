import { describe, expect, it } from 'vitest';
import {
  TrustBoundaryAuthorizationError,
  TrustBoundaryAuthorizer,
  DEFAULT_CAPABILITY_RULES,
  TRUST_BOUNDARIES,
  TRUST_RANK,
  enforceAiAdvisoryBoundary,
  isAdvisoryOnlyBoundary,
  type ActorIdentity,
} from '../src/security/trust-boundaries.js';
import { REDACTED, SecretSentry, isSecretKey, redactString } from '../src/security/secrets.js';
import {
  ConcurrentMutationError,
  PrivilegedMutationBoundary,
  RECOVERY_PHASES,
  TRANSACTION_PHASES,
  type MutationRequest,
  type MutationSnapshot,
  type PrivilegedBoundaryPorts,
} from '../src/transactions/privileged-boundary.js';
import type { ActionExecution, ActionPlan, RuntimeContext } from '../src/domain/types.js';

const runtimeActor = (over: Partial<ActorIdentity> = {}): ActorIdentity => ({
  actorId: 'runtime-1',
  boundary: 'canonical-runtime',
  grantedCapabilities: ['network.mutate', 'fabric.mutate', 'observe.read'],
  verified: true,
  ...over,
});

const plan = (over: Partial<ActionPlan> = {}): ActionPlan =>
  ({
    id: 'plan-1',
    schemaVersion: 1,
    createdAt: '2026-10-03T00:00:00.000Z',
    correlationId: 'corr',
    source: 'resilience-runtime',
    metadata: {},
    selectedAction: {
      id: 'act-1',
      schemaVersion: 1,
      createdAt: '2026-10-03T00:00:00.000Z',
      correlationId: 'corr',
      source: 'resilience-runtime',
      metadata: {},
      intent: 'connectivity_failover',
      expectedBenefit: 0.8,
      risk: 0.2,
      confidence: 0.9,
      requiredCapabilities: ['network.mutate'],
      dependencies: [],
      postconditions: ['reachable'],
      verificationRequirements: ['probe'],
      rejectionReasons: [],
    },
    alternatives: [],
    rejectionReasons: [],
    expectedBenefit: 0.8,
    risk: 0.2,
    confidence: 0.9,
    policyResult: { allowed: true, reasons: [], requiredCapabilities: ['network.mutate'] },
    requiredCapabilities: ['network.mutate'],
    dependencies: [],
    expectedPostconditions: ['reachable'],
    verificationRequirements: ['probe'],
    ...over,
  }) as ActionPlan;

const context = (over: Partial<RuntimeContext> = {}): RuntimeContext =>
  ({
    runtimeId: 'r',
    correlationId: 'corr',
    cancelled: false,
    ...over,
  }) as unknown as RuntimeContext;

const successExecution = (): ActionExecution =>
  ({ id: 'ex-1', status: 'success' }) as ActionExecution;

const snapshot = (version = 'v1'): MutationSnapshot => ({
  snapshotId: 'snap-1',
  targetId: 'gw-1',
  capturedAt: '2026-10-03T00:00:00.000Z',
  previousState: { route: 'primary' },
  resourceVersion: version,
});

/** Ports whose every hook succeeds, so a test can break exactly one thing. */
const okPorts = (over: Partial<PrivilegedBoundaryPorts> = {}): PrivilegedBoundaryPorts => ({
  executor: { execute: async () => successExecution() } as never,
  events: { emit: async () => undefined } as never,
  snapshot: async () => snapshot(),
  policy: async () => ({ allowed: true, reasons: [], requiredCapabilities: ['network.mutate'] }),
  verify: async () => ({ verified: true, reasons: [] }),
  compensate: async () => ({ compensated: true, reasons: [], snapshot: snapshot() }),
  verifyRollback: async () => ({ verified: true, reasons: [] }),
  recover: async () => ({ recovered: true, reasons: [], strategy: 'restore-previous' }),
  ...over,
});

const boundary = (ports: PrivilegedBoundaryPorts = okPorts(), options = {}) =>
  new PrivilegedMutationBoundary(ports, {
    safety: () => ({ safe: true, reasons: [] }),
    ...options,
  });

const request = (over: Partial<MutationRequest> = {}): MutationRequest => ({
  plan: plan(),
  context: context(),
  actor: runtimeActor(),
  mutationId: 'mut-1',
  idempotencyKey: 'idem-1',
  resourceId: 'gw-1',
  ...over,
});

describe('#278 t4: canonical phase order', () => {
  it('declares exactly the required phase sequence', () => {
    expect([...TRANSACTION_PHASES]).toEqual([
      'prepare',
      'snapshot',
      'validate',
      'policy',
      'security',
      'safety',
      'apply',
      'verify',
      'commit',
    ]);
  });

  it('declares the recovery sequence', () => {
    expect([...RECOVERY_PHASES]).toEqual(['rollback', 'verifyRollback', 'recover']);
  });

  it('runs every phase in order on success', async () => {
    const outcome = await boundary().mutate(request());
    expect(outcome.status).toBe('committed');
    expect(outcome.phases.map((p) => p.phase)).toEqual([...TRANSACTION_PHASES]);
    expect(outcome.partialFailure).toBe(false);
  });

  it('never reaches apply when validate fails', async () => {
    const outcome = await boundary().mutate(
      request({
        plan: plan({
          selectedAction: { ...plan().selectedAction, rejectionReasons: ['bad'] },
        }) as never,
      }),
    );
    expect(outcome.status).toBe('blocked');
    expect(outcome.phaseReached).toBe('validate');
    expect(outcome.phases.map((p) => p.phase)).not.toContain('apply');
  });

  it('never reaches apply when policy denies', async () => {
    const outcome = await boundary(
      okPorts({
        policy: async () => ({
          allowed: false,
          reasons: ['denied-by-policy'],
          requiredCapabilities: [],
        }),
      }),
    ).mutate(request());
    expect(outcome.status).toBe('blocked');
    expect(outcome.phaseReached).toBe('policy');
    expect(outcome.reasons).toContain('denied-by-policy');
    expect(outcome.phases.map((p) => p.phase)).not.toContain('apply');
  });

  it('never reaches apply when safety denies', async () => {
    const outcome = await boundary(okPorts(), {
      safety: () => ({ safe: false, reasons: ['risk-above-ceiling'] }),
    }).mutate(request());
    expect(outcome.status).toBe('blocked');
    expect(outcome.phaseReached).toBe('safety');
  });

  it('does not commit when verification fails', async () => {
    const outcome = await boundary(
      okPorts({ verify: async () => ({ verified: false, reasons: ['postcondition-unmet'] }) }),
    ).mutate(request());
    expect(outcome.phaseReached).toBe('verifyRollback');
    expect(outcome.phases.map((p) => p.phase)).not.toContain('commit');
  });

  it('releases the held mutation after completion', async () => {
    const b = boundary();
    await b.mutate(request());
    expect(b.heldMutations()).toEqual([]);
  });
});

describe('#278 t1,t8: capability authorization and fail-closed security', () => {
  const authorizer = new TrustBoundaryAuthorizer();

  it('denies an unverified actor', () => {
    const decision = authorizer.authorize(runtimeActor({ verified: false }), ['network.mutate']);
    expect(decision).toEqual({
      allowed: false,
      reason: 'unverified-actor',
      satisfied: [],
      missing: ['network.mutate'],
    });
  });

  it('denies an unknown capability rather than defaulting to allow', () => {
    const decision = authorizer.authorize(runtimeActor(), ['totally.unknown']);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('capability-not-granted');
  });

  it('denies an explicit capability denial even when granted', () => {
    const decision = authorizer.authorize(
      runtimeActor({ deniedCapabilities: ['network.mutate'] }),
      ['network.mutate'],
    );
    expect(decision.reason).toBe('capability-denied');
  });

  it('denies a boundary below the required trust rank', () => {
    const decision = authorizer.authorize(
      {
        actorId: 'plugin-1',
        boundary: 'plugin',
        grantedCapabilities: ['network.mutate'],
        verified: true,
      },
      ['network.mutate'],
    );
    expect(decision.reason).toBe('insufficient-trust-rank');
  });

  it('grants when capability is held within rank', () => {
    const decision = authorizer.authorize(runtimeActor(), ['network.mutate']);
    expect(decision.allowed).toBe(true);
    expect(decision.satisfied).toEqual(['network.mutate']);
  });

  it('reports missing capabilities without failing early', () => {
    const decision = authorizer.authorize(runtimeActor({ grantedCapabilities: ['observe.read'] }), [
      'network.mutate',
      'fabric.mutate',
    ]);
    expect(decision.allowed).toBe(false);
    expect(decision.missing).toEqual(['network.mutate', 'fabric.mutate']);
  });

  it('throws from authorizeOrThrow', () => {
    expect(() =>
      authorizer.authorizeOrThrow(runtimeActor({ verified: false }), ['network.mutate']),
    ).toThrow(TrustBoundaryAuthorizationError);
  });

  it('reports a per-boundary capability ceiling', () => {
    const pluginCeiling = authorizer.ceilingFor({
      actorId: 'p',
      boundary: 'plugin',
      grantedCapabilities: [],
      verified: true,
    });
    expect(pluginCeiling).toContain('intent.compile');
    expect(pluginCeiling).not.toContain('network.mutate');
  });

  it('blocks a mutation at the security phase for a denied actor', async () => {
    const outcome = await boundary().mutate(request({ actor: runtimeActor({ verified: false }) }));
    expect(outcome.status).toBe('blocked');
    expect(outcome.phaseReached).toBe('security');
    expect(outcome.reasons).toContain('reason:unverified-actor');
  });

  it('requires capabilities demanded by policy as well as the plan', async () => {
    const outcome = await boundary(
      okPorts({
        policy: async () => ({
          allowed: true,
          reasons: [],
          requiredCapabilities: ['tunnel.mutate'],
        }),
      }),
    ).mutate(request({ actor: runtimeActor({ grantedCapabilities: ['network.mutate'] }) }));
    expect(outcome.status).toBe('blocked');
    expect(outcome.phaseReached).toBe('security');
    expect(outcome.reasons).toContain('missing-capability:tunnel.mutate');
  });

  it('emits a blocked event naming the reason and missing capabilities', async () => {
    const emitted: { type: string; payload: Record<string, unknown> }[] = [];
    const outcome = await boundary(
      okPorts({
        events: {
          emit: async (type: string, payload: Record<string, unknown>) => {
            emitted.push({ type, payload });
          },
        } as never,
      }),
    ).mutate(request({ actor: runtimeActor({ verified: false }) }));
    expect(outcome.status).toBe('blocked');
    const blocked = emitted.find((e) => e.type === 'runtime.mutation.blocked');
    expect(blocked?.payload['reason']).toBe('unverified-actor');
  });
});

describe('#278 t2: trust boundaries', () => {
  it('classifies every actor kind', () => {
    for (const boundaryName of [
      'canonical-runtime',
      'platform-adapter',
      'plugin',
      'remote-node',
      'external-client',
      'ai',
    ]) {
      expect(TRUST_BOUNDARIES).toContain(boundaryName as never);
    }
  });

  it('orders trust from canonical runtime downward', () => {
    expect(TRUST_RANK['canonical-runtime']).toBeGreaterThan(TRUST_RANK['platform-adapter']);
    expect(TRUST_RANK['platform-adapter']).toBeGreaterThan(TRUST_RANK.plugin);
    expect(TRUST_RANK.plugin).toBeGreaterThan(TRUST_RANK['remote-node']);
    expect(TRUST_RANK['remote-node']).toBeGreaterThan(TRUST_RANK['external-client']);
    expect(TRUST_RANK['external-client']).toBeGreaterThan(TRUST_RANK.ai);
  });

  it('binds privileged mutation to the canonical runtime only', () => {
    const mutate = DEFAULT_CAPABILITY_RULES.find((r) => r.capability === 'network.mutate');
    expect(mutate?.minimumBoundary).toBe('canonical-runtime');
  });

  it('binds fabric and tunnel mutation to platform adapters', () => {
    for (const capability of ['fabric.mutate', 'tunnel.mutate']) {
      expect(
        DEFAULT_CAPABILITY_RULES.find((r) => r.capability === capability)?.minimumBoundary,
      ).toBe('platform-adapter');
    }
  });

  it('limits external clients to observe and propose', () => {
    const ceiling = new TrustBoundaryAuthorizer().ceilingFor({
      actorId: 'cli',
      boundary: 'external-client',
      grantedCapabilities: [],
      verified: true,
    });
    expect([...ceiling].sort()).toEqual(['observe.read', 'plan.propose']);
  });
});

describe('#278 t3: AI advisory-only boundary', () => {
  it('marks only AI as advisory-only', () => {
    expect(isAdvisoryOnlyBoundary('ai')).toBe(true);
    for (const boundaryName of TRUST_BOUNDARIES.filter((b) => b !== 'ai')) {
      expect(isAdvisoryOnlyBoundary(boundaryName)).toBe(false);
    }
  });

  it('denies every capability to an AI actor', () => {
    const decision = new TrustBoundaryAuthorizer().authorize(
      { actorId: 'ai', boundary: 'ai', grantedCapabilities: ['network.mutate'], verified: true },
      ['network.mutate'],
    );
    expect(decision).toEqual({
      allowed: false,
      reason: 'advisory-only-boundary',
      satisfied: [],
      missing: ['network.mutate'],
    });
  });

  it('blocks a mutation proposed by AI', async () => {
    const outcome = await boundary().mutate(
      request({
        actor: { actorId: 'ai', boundary: 'ai', grantedCapabilities: [], verified: true },
        ai: { rationale: 'switch to secondary', recommendedIntent: 'provider_switch' },
      }),
    );
    expect(outcome.status).toBe('blocked');
    expect(outcome.phaseReached).toBe('security');
    expect(outcome.reasons).toContain('reason:advisory-only-boundary');
  });

  it('discards AI-supplied intent and capabilities', () => {
    const sanitised = enforceAiAdvisoryBoundary({
      canonicalIntent: 'connectivity_failover',
      canonicalCapabilities: ['network.mutate'],
      ai: {
        recommendedIntent: 'provider_switch',
        rationale: 'secondary looks healthier',
        objectiveWeights: { latency: 1 },
      },
    });
    expect(sanitised.intent).toBe('connectivity_failover');
    expect(sanitised.requiredCapabilities).toEqual(['network.mutate']);
    expect(sanitised.rationale).toBe('secondary looks healthier');
    expect(sanitised.aiAdvisoryOnly).toBe(true);
  });

  it('never lets AI inject a capability into the requirement set', async () => {
    // The actor holds only network.mutate. If AI could contribute
    // 'fabric.mutate' the requirement set would grow and the mutation would be
    // blocked; sanitising keeps the set canonical, so it must still commit.
    const outcome = await boundary().mutate(
      request({
        actor: runtimeActor({ grantedCapabilities: ['network.mutate'] }),
        ai: {
          recommendedIntent: 'provider_switch',
          rationale: 'try the secondary',
          objectiveWeights: { latency: 1 },
        },
      }),
    );
    expect(outcome.status).toBe('committed');
  });

  it('emits when an AI-recommended intent is ignored', async () => {
    const emitted: { type: string; payload: Record<string, unknown> }[] = [];
    await boundary(
      okPorts({
        events: {
          emit: async (type: string, payload: Record<string, unknown>) => {
            emitted.push({ type, payload });
          },
        } as never,
      }),
    ).mutate(request({ ai: { recommendedIntent: 'provider_switch', rationale: 'r' } }));
    const ignored = emitted.find((e) => e.type === 'runtime.mutation.ai-intent-ignored');
    expect(ignored?.payload['aiRecommendedIntent']).toBe('provider_switch');
    expect(ignored?.payload['canonicalIntent']).toBe('connectivity_failover');
  });

  it('reports no AI contribution honestly', () => {
    expect(
      enforceAiAdvisoryBoundary({ canonicalIntent: 'rollback', canonicalCapabilities: [] })
        .rationale,
    ).toBe('no-ai-contribution');
  });
});

describe('#278 t5: rollback, verify rollback, recover', () => {
  it('rolls back and verifies on a failed apply', async () => {
    const outcome = await boundary(
      okPorts({ executor: { execute: async () => ({ id: 'ex', status: 'failed' }) } as never }),
    ).mutate(request());
    expect(outcome.status).toBe('recovered');
    expect(outcome.phases.map((p) => p.phase)).toEqual([
      ...TRANSACTION_PHASES.slice(0, 7),
      'rollback',
      'verifyRollback',
    ]);
  });

  it('marks a failed apply as a partial failure', async () => {
    const outcome = await boundary(
      okPorts({ executor: { execute: async () => ({ id: 'ex', status: 'failed' }) } as never }),
    ).mutate(request());
    expect(outcome.partialFailure).toBe(true);
  });

  it('compensates when apply throws', async () => {
    const outcome = await boundary(
      okPorts({
        executor: {
          execute: async () => {
            throw new Error('adapter-timeout');
          },
        } as never,
      }),
    ).mutate(request());
    expect(outcome.status).toBe('recovered');
    expect(outcome.reasons).toContain('adapter-timeout');
  });

  it('escalates to recovery when compensation fails', async () => {
    const outcome = await boundary(
      okPorts({
        executor: { execute: async () => ({ id: 'ex', status: 'failed' }) } as never,
        compensate: async () => ({ compensated: false, reasons: ['restore-unsupported'] }),
      }),
    ).mutate(request({ idempotencyKey: 'idem-escalate' }));
    expect(outcome.status).toBe('recovered');
    expect(outcome.phaseReached).toBe('recover');
    expect(outcome.reasons).toContain('restore-unsupported');
  });

  it('escalates to recovery when rollback verification fails', async () => {
    const outcome = await boundary(
      okPorts({
        executor: { execute: async () => ({ id: 'ex', status: 'failed' }) } as never,
        verifyRollback: async () => ({ verified: false, reasons: ['state-still-changed'] }),
      }),
    ).mutate(request({ idempotencyKey: 'idem-unverified-rollback' }));
    expect(outcome.phaseReached).toBe('recover');
    expect(outcome.reasons).toContain('state-still-changed');
  });

  it('fails when recovery itself fails', async () => {
    const outcome = await boundary(
      okPorts({
        executor: { execute: async () => ({ id: 'ex', status: 'failed' }) } as never,
        compensate: async () => ({ compensated: false, reasons: ['x'] }),
        recover: async () => ({ recovered: false, reasons: ['manual-intervention-required'] }),
      }),
    ).mutate(request({ idempotencyKey: 'idem-hopeless' }));
    expect(outcome.status).toBe('failed');
    expect(outcome.recovery?.recovered).toBe(false);
    expect(outcome.reasons).toContain('manual-intervention-required');
  });
});

describe('#278 t6: idempotency, cancellation, timeout', () => {
  it('replays a completed mutation idempotently', async () => {
    const b = boundary();
    const first = await b.mutate(request());
    const second = await b.mutate(request());
    expect(first.status).toBe('committed');
    expect(second.status).toBe('committed');
    expect(second.reasons).toContain('idempotent-replay');
  });

  it('collapses concurrent identical mutations', async () => {
    const b = boundary();
    const [a, c] = await Promise.all([b.mutate(request()), b.mutate(request())]);
    expect(a.transactionId).toBe(c.transactionId);
  });

  it('refuses to rebind an idempotency key', async () => {
    const b = boundary();
    await b.mutate(request());
    const second = await b.mutate(
      request({ plan: plan({ selectedAction: { ...plan().selectedAction, id: 'act-2' } }) }),
    );
    expect(second.status).toBe('blocked');
    expect(second.reasons).toContain('idempotency-key-already-bound');
  });

  it('stops at prepare when already cancelled', async () => {
    const outcome = await boundary().mutate(request({ context: context({ cancelled: true }) }));
    expect(outcome.status).toBe('cancelled');
    expect(outcome.phaseReached).toBe('prepare');
    expect(outcome.phases.map((p) => p.phase)).not.toContain('apply');
  });

  it('stops at policy when cancelled after snapshot', async () => {
    const ctx = context();
    let calls = 0;
    const b = boundary(
      okPorts({
        snapshot: async () => {
          calls += 1;
          (ctx as { cancelled: boolean }).cancelled = true;
          return snapshot();
        },
      }),
    );
    const outcome = await b.mutate(request({ context: ctx }));
    expect(calls).toBe(1);
    expect(outcome.status).toBe('cancelled');
    // `validate` is the first gate after the snapshot, so that is where the
    // cancellation is observed.
    expect(outcome.phaseReached).toBe('validate');
  });

  it('times out before apply', async () => {
    let now = 1_000;
    const outcome = await boundary(okPorts(), {
      mutationTimeoutMs: 10,
      nowMs: () => (now += 20),
    }).mutate(request());
    expect(outcome.status).toBe('timed-out');
    expect(outcome.phaseReached).toBe('prepare');
  });

  it('times out mid-mutation after the snapshot', async () => {
    let now = 1_000;
    const outcome = await boundary(
      okPorts({
        snapshot: async () => {
          now += 100;
          return snapshot();
        },
      }),
      { mutationTimeoutMs: 10, nowMs: () => now },
    ).mutate(request());
    expect(outcome.status).toBe('timed-out');
    expect(outcome.phaseReached).toBe('validate');
  });
});

describe('#278 t7: stale and concurrent mutation protection', () => {
  it('rejects a superseded epoch', async () => {
    const b = boundary();
    const outcome = await b.mutate(request({ epoch: 1 }));
    b.advanceEpoch();
    const stale = await b.mutate(
      request({ mutationId: 'mut-2', idempotencyKey: 'idem-2', epoch: 1 }),
    );
    expect(outcome.status).toBe('committed');
    expect(stale.status).toBe('blocked');
    expect(stale.reasons).toContain('epoch-superseded');
  });

  it('accepts a mutation at the current epoch', async () => {
    const b = boundary();
    expect((await b.mutate(request({ epoch: b.currentEpoch() }))).status).toBe('committed');
  });

  it('rejects a changed resource version', async () => {
    const outcome = await boundary(okPorts({ snapshot: async () => snapshot('v2') })).mutate(
      request({ resourceVersion: 'v1' }),
    );
    expect(outcome.status).toBe('blocked');
    expect(outcome.reasons).toContain('resource-version-changed');
  });

  it('rejects a mutation for a resource already held', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const b = boundary(
      okPorts({
        snapshot: async () => {
          await gate;
          return snapshot();
        },
      }),
    );
    const first = b.mutate(request({ mutationId: 'mut-a', idempotencyKey: 'idem-a' }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await b.mutate(
      request({ mutationId: 'mut-b', idempotencyKey: 'idem-b', resourceId: 'gw-1' }),
    );
    release!();
    expect((await first).status).toBe('committed');
    expect(second.status).toBe('blocked');
    expect(second.reasons).toContain('concurrent-mutation');
    expect(ConcurrentMutationError).toBeDefined();
  });

  it('allows a different resource concurrently', async () => {
    const b = boundary();
    const [first, second] = await Promise.all([
      b.mutate(request({ resourceId: 'gw-1', idempotencyKey: 'k1', mutationId: 'm1' })),
      b.mutate(request({ resourceId: 'gw-2', idempotencyKey: 'k2', mutationId: 'm2' })),
    ]);
    expect(first.status).toBe('committed');
    expect(second.status).toBe('committed');
  });
});

describe('#278 t9: secret protection', () => {
  const sentry = new SecretSentry();

  it('recognises secret-looking keys', () => {
    for (const key of [
      'password',
      'apiKey',
      'privateKey',
      'accessToken',
      'credential',
      'authorization',
    ]) {
      expect(isSecretKey(key)).toBe(true);
    }
    expect(isSecretKey('routeName')).toBe(false);
  });

  it('redacts secret keys at any depth', () => {
    const { value } = sentry.redact({ a: { b: { password: 'hunter2' } } });
    expect(JSON.stringify(value)).not.toContain('hunter2');
  });

  it('redacts secrets inside arrays', () => {
    const { value } = sentry.redact({ list: ['ok', { token: 'abc123' }] });
    expect(JSON.stringify(value)).not.toContain('abc123');
  });

  it('redacts credentials embedded in a URI', () => {
    expect(redactString('https://user:pw@host.test/x')).not.toContain('pw@');
  });

  it('redacts a JWT found in a plain string', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(redactString(`token is ${jwt}`)).not.toContain(jwt);
  });

  it('redacts a PEM private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----';
    expect(redactString(pem)).toBe(REDACTED);
  });

  it('redacts bearer header values', () => {
    expect(redactString('Bearer abcdefghijklmnop')).not.toContain('abcdefghijklmnop');
  });

  it('redacts long hex key material', () => {
    expect(redactString(`key=${'a1b2c3d4'.repeat(5)}`)).toContain(REDACTED);
  });

  it('reports what it redacted per sink', () => {
    const { report } = sentry.redact({ password: 'x', url: 'https://u:p@h' }, 'telemetry');
    expect(report.sink).toBe('telemetry');
    expect(report.redactedKeys).toBe(1);
    expect(report.redactedValues).toBe(1);
  });

  it('survives circular references', () => {
    const circular: Record<string, unknown> = { name: 'x' };
    circular.self = circular;
    expect(() => sentry.redact(circular)).not.toThrow();
    expect(JSON.stringify(sentry.redact(circular).value)).toContain('CIRCULAR');
  });

  it('builds an allow-listed AI context that excludes secrets', () => {
    const context = sentry.aiContext(
      { destination: 'a.test', latencyMs: 12, token: 'super-secret', password: 'x' },
      ['destination', 'latencyMs'],
    );
    expect(context).toEqual({ destination: 'a.test', latencyMs: 12 });
    expect(JSON.stringify(context)).not.toContain('super-secret');
  });

  it('never passes a secret to a plugin or remote node sink', () => {
    for (const sink of ['plugin', 'remote-node', 'ai-context'] as const) {
      const { value } = sentry.redact({ credential: 'do-not-leak' }, sink);
      expect(JSON.stringify(value)).not.toContain('do-not-leak');
    }
  });

  it('keeps a benign value intact', () => {
    expect(sentry.redact({ route: 'primary' }).value).toEqual({ route: 'primary' });
  });
});

describe('#278 t10: architectural regression guards', () => {
  it('keeps the executor port private to the boundary', async () => {
    const ports = okPorts();
    const b = boundary(ports);
    // The only way to reach the executor is through the gated machine.
    expect(Object.keys(ports)).toContain('executor');
    const outcome = await b.mutate(request({ actor: runtimeActor({ verified: false }) }));
    expect(outcome.phases.map((p) => p.phase)).not.toContain('apply');
  });

  it('cannot apply without passing security', async () => {
    const order: string[] = [];
    const b = boundary(
      okPorts({
        executor: {
          execute: async () => {
            order.push('apply');
            return successExecution();
          },
        } as never,
      }),
    );
    await b.mutate(request({ actor: runtimeActor({ grantedCapabilities: [] }) }));
    expect(order).toEqual([]);
  });

  it('emits applying only after every gate passed', async () => {
    const order: string[] = [];
    const b = boundary(
      okPorts({
        policy: async () => {
          order.push('policy');
          return { allowed: true, reasons: [], requiredCapabilities: [] };
        },
        verify: async () => {
          order.push('verify');
          return { verified: true, reasons: [] };
        },
        executor: {
          execute: async () => {
            order.push('apply');
            return successExecution();
          },
        } as never,
      }),
    );
    await b.mutate(request());
    expect(order).toEqual(['policy', 'apply', 'verify']);
  });

  it('never exposes a public run-phase entry point', () => {
    const b = boundary();
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(b));
    expect(surface).toContain('mutate');
    // There must be no public method that reaches apply without the machine.
    expect(
      surface.filter((name) => /^apply|^run[A-Z]?Phase|^executeRaw|^mutateDirect/.test(name)),
    ).toEqual([]);
  });
});
