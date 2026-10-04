# Evidence report — issue #278 (issue #272 Section G)

Issue #278: Security, Safety Kernel & Transactional Network Execution.
Goal: enforce one secure privileged mutation boundary.

## Honest baseline

Existing partial coverage found by inspection, not assumed:

- `src/safety/safety-kernel.ts` — `SafetyRollbackRecoveryKernel` with checkpoint,
  rollback and recovery. Kept.
- `src/transactions/action-transaction.ts` — idempotency keys, in-flight
  collapsing, duplicate/conflict detection. Kept.
- `src/policy/policy.ts` — policy evaluation with `failClosed`.
- `src/decisions/records.ts:16` — `redact()` matching secret-looking **key names**.

Confirmed absent before this change:

- the canonical phase sequence — `grep` for `phase`/`snapshot`/`verify` in
  `action-transaction.ts` returned **nothing**; it called
  `executor.execute(plan, context)` directly
- trust boundaries — `grep` for `trustBoundary|leastPrivilege` → 0
- capability authorization — `grep` for `authorizeCapability` → 0
- AI advisory-only enforcement outside the new knowledge code — 0
- rollback verification — `grep` for `verifyRollback` → 0

**The critical baseline finding:** `ActionTransactionEngine.runTransaction()`
had **no phases at all**. Snapshot, validation, policy, security, safety and
verification all happened upstream in the orchestrator, so the transaction
boundary itself enforced nothing. Nothing verified a mutation, nothing
compensated a partial failure, and nothing checked cancellation, timeout or
staleness. That is precisely what #278's acceptance criterion forbids.

## Bounded scope (no new authority)

All new code is inside `@irp/resilience-runtime`. The privileged executor port
is `private readonly` on `PrivilegedMutationBoundary`, so it cannot be obtained
and used to bypass the gates.

| File                                      | Purpose                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `src/security/trust-boundaries.ts`        | boundary classification, least-privilege authorization, AI advisory sanitiser |
| `src/security/secrets.ts`                 | key/value-pattern secret redaction, sink-aware, AI allow-list                 |
| `src/transactions/privileged-boundary.ts` | the canonical phase machine and recovery path                                 |

## Task coverage

### 1. Least privilege and capability-based authorization

`TrustBoundaryAuthorizer.authorize()` evaluates in a fixed fail-closed order:
unverified actor → advisory-only boundary → explicit deny → unknown capability →
insufficient trust rank → not-granted. `DEFAULT_CAPABILITY_RULES` binds each
capability to the weakest boundary allowed to hold it, and `ceilingFor()` reports
the maximum privilege available to an actor rather than what it holds now.

Deliberately named `TrustBoundaryAuthorizer`, not `CapabilityAuthorizer` —
see the duplicate-contract regression below.

### 2. Trust boundaries

`TRUST_BOUNDARIES` = canonical-runtime (100) > platform-adapter (60) > plugin
(30) > remote-node (20) > external-client (10) > ai (5). `network.mutate` is
bound to `canonical-runtime`; `fabric.mutate`/`tunnel.mutate` to
`platform-adapter`. An external client's entire ceiling is `observe.read` +
`plan.propose`.

### 3. AI advisory-only boundary

`isAdvisoryOnlyBoundary('ai')` is the single source of truth, consulted by the
authorizer (every capability denied) **and** wired into the phase machine: at
`security`, `enforceAiAdvisoryBoundary()` rebuilds the requirement set from the
canonical plan, so an AI-suggested capability can never join it, and an
AI-recommended intent that differs from the canonical one emits
`runtime.mutation.ai-intent-ignored`. AI also cannot satisfy `network.mutate`
even when granted it.

### 4. prepare → snapshot → validate → policy → security → safety → apply → verify → commit

`TRANSACTION_PHASES` declares exactly that order and the machine records every
phase. Cancellation and timeout are re-checked before each gate. Tests assert
`apply` is absent from the phase list when validate, policy, safety or security
fails, and that `commit` is absent when verification fails.

### 5. rollback → verifyRollback → recover

`failurePath()` runs compensation, then **verifies the compensation actually
restored prior state**, and escalates to `recover` whenever compensation is
incomplete _or_ its verification fails. A failed apply or a thrown adapter both
enter this path and are flagged `partialFailure: true`.

### 6. Idempotency, cancellation, timeout, compensation, partial failure

Idempotent replay returns the original outcome with `idempotent-replay`;
concurrent identical mutations collapse to one execution. Cancellation is
observed at whichever gate is current. Timeout is a whole-transaction budget
re-checked before each phase. Compensation and partial-failure handling as above.

### 7. Stale/concurrent mutation protection

A mutation carrying an epoch older than the boundary's is rejected with
`epoch-superseded`; `advanceEpoch()` invalidates every in-flight mutation. A
snapshot whose `resourceVersion` differs from the request yields
`resource-version-changed`. A resource already held by another mutation yields
`concurrent-mutation`; different resources proceed concurrently.

### 8. Fail-closed behaviour

Every gate returns a recorded `blocked` outcome rather than throwing, so a
denial can never be mistaken for success. An unrecognised capability is rejected,
never implicitly allowed. `mutate()` never throws for gate rejection.
The one thing that _is_ thrown (`authorizeOrThrow`) is opt-in.

### 9. Secret protection

The pre-existing `redact()` matched key names only. `SecretSentry` additionally
redacts **values**: credentials in URIs, JWTs, PEM private-key blocks, bearer
header values, provider key shapes and long hex key material — at any depth,
inside arrays, and through circular references. `aiContext()` narrows further
with an explicit top-level allow-list, which is stronger than pattern matching.

### 10. Architectural regression tests

Two layers:

- **Unit** (`tests/security-278.test.ts`): asserts the executor is unreachable
  when security fails, that `policy` → `apply` → `verify` ordering holds, and
  that the class exposes no `apply`/`executeRaw`/`mutateDirect` surface.
- **Repository guard** (Check 13 in `scripts/architecture-guards.cjs`): blocks
  constructing an `ActionExecutor`, declaring a privileged
  `execute(plan: ActionPlan, context: RuntimeContext)`, calling a transaction
  engine's `execute()` directly, or constructing `PrivilegedMutationBoundary`
  outside the canonical file. It also asserts the canonical file exists and still
  declares all nine transaction phases and all three recovery phases.

**The guard was proven to bite:** injecting
`apps/api/src/__bypass_probe.ts` with a privileged `execute(plan, context)`
produced `declares a privileged execute(plan, context) implementation outside the
canonical boundary` and a non-zero exit; removing it returned to passing.

## Acceptance criteria

- **Attributable to the canonical runtime, policy, security and safety** — every
  mutation passes all four gates and emits `applying`/`committed`/
  `blocked`/`rolledback`/`recovered` events carrying the transaction id.
- **Verifiable recovery path** — `verify` before commit, and `verifyRollback`
  after compensation, both asserted by tests including the escalation case.
- **No direct privileged execution bypass** — enforced by a repository guard
  verified to fail on a real violation.

## Bugs found and fixed during the work

1. **The idempotency-rebind guard never fired.** `completed` stored the outcome
   but not the bound action id, and the rebind check tested
   `completed.phases.length === 0` — never true. Replaying a key against a
   _different_ action would have silently executed. Fixed by storing
   `{ actionId, outcome }` and comparing action ids, which is the actual
   fail-closed condition.
2. **I introduced a duplicate contract with different semantics.** My
   `CapabilityAuthorizer` collided by name with `@irp/kernel`'s existing
   `CapabilityAuthorizer` (which answers a different question: does a DI
   principal hold a capability). Same name, incompatible semantics — the same
   ambiguity class flagged earlier for `IntentConflict`. Renamed mine to
   `TrustBoundaryAuthorizer` / `TrustBoundaryAuthorizationError`, with a comment
   explaining the distinction. Duplicate contracts returned 24 → 23.
3. **Dead branch in `SecretSentry`.** `untrustedSink ? redactString(input) : redactString(input)`
   was identical on both arms; the narrowing now lives structurally in
   `aiContext()`.
4. **`enforceAiAdvisoryBoundary` was imported but unused** (lint failure). Rather
   than delete it, it was wired into the `security` phase — which is where the
   AI boundary actually belongs — and covered by two new tests.

Test-expectation corrections: three recovery tests never forced a failure so the
compensation path was unreachable, and a cancellation test expected `policy` when
`validate` is the first gate after the snapshot.

## Test-suite stability note

One full-suite run failed `@irp/api#test` while the suite took 14m32 (vs the
normal ~4m50). The failure was **not reproducible**: 3 standalone runs, a filtered
uncached turbo run and a full uncached re-run all passed. Diagnosed as
load-induced flake from machine contention, not a regression from this change
(`apps/api` does not import the new modules). No test was weakened.

## Tests

`tests/security-278.test.ts` — **53 tests**: exact phase and recovery sequences,
each gate blocking `apply`, verification blocking `commit`, every authorization
denial reason, per-boundary ceilings, AI denial and capability-injection
immunity, rollback/escalation/recovery-failure, idempotent replay, concurrent
collapse, rebind refusal, cancellation at two phases, timeout at two phases,
epoch and resource-version staleness, concurrent-resource rejection, concurrent
different-resource success, every secret redaction path, AI allow-listing,
circular safety, and the four bypass guards.

- `@irp/resilience-runtime`: **39 test files, 453 tests PASS**
- Full workspace: **172/172 turbo tasks PASS**, 0 cached

## CI/runtime evidence (this session, uncached)

- `turbo run build typecheck lint test --force` — 172/172 PASS
- `pnpm run validate` — PASS (790 files)
- `pnpm run validate:docs` — PASS (147 files)
- `pnpm run architecture:check` — PASS
- `pnpm run architecture:guards` — PASS (and proven to fail on a real violation)
- `pnpm run audit:deep` — PASS (0 findings)
- `pnpm run architecture:archaeology` — 0 orphan tests, 0 orphan modules,
  23 duplicate contracts, 29 drift findings (0 critical, 0 major)

## Known limitations

- `PrivilegedMutationBoundary` is composed into the canonical runtime via
  `createPrivilegedMutationBoundary`. When a canonical knowledge store is
  present, live mutations route through the boundary's phase machine; the
  legacy `ActionTransactionEngine` path remains only for direct
  non-canonical `ResilienceRuntime` use and its pre-existing safety tests.
- `SecretSentry` redacts by pattern; it does not perform cryptographic
  verification of secrets or guarantee removal from an opaque byte buffer.
- `packages/kernel`'s `CapabilityAuthorizer` and this `TrustBoundaryAuthorizer`
  remain two distinct authorizers by design. Consolidating them is a cross-package
  contract migration, not a cleanup.
- Sections H (#279) and J (#281) are implemented; see their evidence reports
  for remaining external-only blockers (remote CI, release artifacts,
  device soak).
- No CI run has executed against this SHA.
