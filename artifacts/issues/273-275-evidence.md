# Evidence report — issues #273 and #275

Parent tracker: #272. Baseline: Phase 78 on `main`.

#273 — Repository Archaeology, Authority Map & Architecture Drift
#275 — Programmable Connectivity Fabric, Resources & Capabilities

## Objective

#273: reconstruct executable repository truth and eliminate architectural ambiguity.
#275: reconcile network resources into one programmable fabric model.

## Bounded scope (no new authorities)

All runtime code lives inside the canonical `@irp/resilience-runtime` package.
All archaeology lives in `scripts/` (validation tooling, never runtime authority).
No CI workflow edits, no daemon/client/native changes, no second control plane.

---

## #275 Implementation

### Pre-existing state (honest baseline)

`packages/resilience-runtime/src/fabric.ts` already had: all 17 resource kinds,
all 11 states, the unified attribute surface, bounded/cancellable/incremental
discovery arguments, ownership conflict detection, capability registry class, and
`reconcileRoutingGraph`. Those were **not** re-implemented.

### Real gaps found and closed

| # | Gap found | Fix |
|---|---|---|
| 1 | `FabricCapabilityRegistry` was **never read by `select()`** — task 5's registry was decorative; selection trusted resource-local claims | New `FabricCapabilityAuthority` (`fabric-authority.ts`) with `authorize`/`authorizeAll`; `select()` now consults it |
| 2 | No legal-transition rules for the 11 states — a resource could jump `FAILED -> HEALTHY` | `FABRIC_STATE_TRANSITIONS` + `assertFabricStateTransition` + `IllegalFabricStateTransitionError` (`fabric-lifecycle.ts`) |
| 3 | Discovery was not freshness-aware; stale evidence accumulated forever | `evaluateFabricFreshness`, `partitionByFreshness`, `freshnessReport()`, explicit `pruneExpired()` |
| 4 | "Failure-domain diversity" was a boolean *"has one preferred domain"* — cannot distinguish independent paths from two paths through one carrier | `sharesFailureDomain`, `selectDiverseResources` (greedy maximal-disjoint), `countDistinctFailureDomains`; `select()` returns `diversity` evidence |
| 5 | No ownership index/query | `ownershipIndex()`, `resourcesOwnedBy()` |
| 6 | Platform compatibility declared on capabilities but never enforced | `platform` on `FabricSelectionRequest`, enforced via registry |
| 7 | Safety ceiling and runtime-authority requirement absent | `maximumSafety`, `requireRuntimeAuthority` enforced via registry |

### Deliberate non-change

An earlier iteration pruned expired resources *inside* `discover()`. That was
reverted: pruning deletes evidence. Staleness is now surfaced
(`freshnessReport`) and honoured by `select()`, while compaction stays an
explicit `pruneExpired()` operation.

### Task coverage

1. Canonicalize 17 kinds — already present, asserted in tests.
2. Unified identity/state/health/confidence/freshness/trust/capacity/cost/ownership/failure-domain/lifecycle — already present, asserted.
3. Canonicalize 11 states — already present + explicit state machine.
4. Bounded/cancellable/incremental/freshness-aware discovery — bounds and cancellation already present; freshness now explicit.
5. Unified capability registry — **now enforceable** (was decorative).
6. Reconcile `NetworkPathGraph` into fabric graph — already present, asserted.
7. True failure-domain diversity — **now real** (was a boolean approximation).
8. Explicit non-duplicated ownership — index/query added; conflict already rejected.

**Tests:** `tests/fabric-275.test.ts` (23 new tests) + `tests/fabric.test.ts`
(5, relocated — see #273 orphan finding). 28/28 pass.

---

## #273 Implementation

New engine: `scripts/archaeology.mjs` (`pnpm run architecture:archaeology`).
Produces evidence-backed artifacts in `artifacts/archaeology/`:

| Artifact | Task |
|---|---|
| `inventory.json` | 1 — packages/apps/clients/infra/ops/config/docs/scripts/tools/CI/deployment/tests/entrypoints |
| `runtime-paths.json` | 2 — entrypoint -> privileged mutation -> verification traces |
| `capability-matrix.json` | 3 — capability -> implementation -> owner -> consumer -> runtime path |
| `authority-map.json` | 4 — decision/mutation authority map |
| `phase-audit.json` | 5 — all phase docs audited incl. artifacts beyond Phase 78 |
| `orphans.json` | 6/7 — orphaned tests/modules, duplicate contracts, unreferenced persistence models |
| `graph-reconciliation.json` | 8 — the 4 architecture graphs reconciled against source |
| `drift-register.json` / `.md` | 9 — severity, evidence, impact, owner, fix, verification |

### Methodological corrections made during the work

Three initial detectors produced **false positives**; each was fixed rather
than shipped, because a noisy archaeology report is worse than none:

1. **Capability extraction** matched bare dotted identifiers, sweeping in
   `dns.he.net` (hostname), `dns.length` (array length) and
   `gateway.failover.started` (event name) → 121 bogus findings.
   Replaced with **ground truth**: capabilities are read from the *executed*
   canonical adapter registry (`dist/adapter-registry.js`), and consumers are
   located by exact literal search. Result: 11 real capabilities.
2. **Orphan module detection** did not follow barrel re-export chains, so every
   module exported only via `resilience/index.ts` or `platform/index.ts` looked
   orphaned → 14 bogus findings. Now resolves transitively from the root
   barrel. Result: 0 orphans.
3. **Graph entrypoint reconciliation** assumed `entrypoints` were bare paths,
   but the execution graph stores descriptive labels such as
   `"apps/daemon/src/index.ts RuntimeScheduler"` → 3 bogus CRITICAL findings.
   Now extracts the leading path token and ignores descriptive-only entries.
   Result: 0 CRITICAL.

### Real findings

- **Orphaned + broken test (fixed).** `packages/resilience-runtime/src/fabric.test.ts`
  was compiled by `tsc` into `dist/` but never executed, because the vitest
  include glob is `packages/resilience-runtime/tests/**/*.test.ts`. It was also
  **failing on unmodified `HEAD`** — the helper hardcoded `owner: 'test-provider'`
  for both providers, so the duplicate-ownership assertion it made could never
  trigger. Verified by stashing my changes and re-running against `093f833`.
  Fixed: moved to `tests/fabric.test.ts`, owner now derived from the claiming
  provider. It now runs and passes (5/5).
- **Duplicate contracts I introduced in #274 (fixed).** `IntentConflict` was
  declared in both `domain/types.ts` and `intent/arbitration.ts`; `arbitrateIntents`
  was exported from both `intent/arbitration.ts` and `intent/governance.ts` with
  **different semantics** — an ambiguous duplicate. Consolidated: `IntentConflict`
  is declared once and re-exported; the governance variant is renamed
  `selectGovernedIntents` with a docstring explaining the distinction.
  Duplicate-contract count fell 25 → 23.
- **23 remaining duplicate contracts (registered, MINOR).** e.g. `AddressFamily`
  in 3 packages, `Principal` in 3, `RuntimeContext`/`RuntimeState` in core and
  resilience-runtime, `DomainEvent` in core and shared. Pre-existing, recorded
  in the drift register with owner and fix rather than silently "fixed", since
  collapsing them is a cross-package contract migration, not a cleanup.
- **6 unsubstantiated phase-document claims (registered, MINOR).** Phase docs
  claiming implementation without citing source/test/CI evidence. Recorded as
  `claim-with-citation` / `unsubstantiated-claim`, never treated as current proof.

### CI enforcement (task 10)

- `scripts/archaeology.mjs` exits non-zero on CRITICAL drift.
- Wired into `scripts/validate-repository.mjs`, so `pnpm validate` fails the build.
- **Verified by injection:** adding a non-existent entrypoint to the binding
  contract produced `CRITICAL: declared-entrypoint-missing` and a non-zero exit;
  restoring the contract returned to 0 critical. The gate is proven to bite.

---

## Acceptance criteria status

#273:
- "No major capability lacks a known owner/consumer/runtime path" — **met**:
  capability matrix is 0 without implementation, 0 without owner, 0 without consumer.
- "No undocumented production mutation authority remains" — **met**: 0 authority violations; both entrypoints compose canonically; no direct `ResilienceRuntime` construction.
- "Architecture maps are evidence-backed and regenerated after implementation" — **met**: 20/20 graph nodes reconciled, 0 unresolvable owners; `integration-graph` and `full-system-assurance` regenerated.
- "Findings are linked to concrete source/tests/runtime evidence" — **met**: every drift finding carries evidence paths, owner, fix and verification command.

#275:
- "The runtime can discover, reason about and select real resources through stable contracts without domain packages becoming competing control planes" — **met** for the fabric contract surface; capability authorization is now enforced through the canonical runtime's registry, and domain packages hold no authority (verified by `architecture:guards`).

---

## Tests

- `@irp/resilience-runtime`: **36 test files, 299 tests PASS** (verified
  `pnpm --filter @irp/resilience-runtime test`). Includes the relocated orphan
  `tests/fabric.test.ts` (5) and new `tests/fabric-275.test.ts` (23).
- Full workspace: **172/172 turbo tasks PASS**, 0 cached
  (`turbo run build typecheck lint test --force`).

## CI/runtime evidence (this session, `--force`, uncached)

- `turbo run build typecheck lint test` — 172/172 PASS
- `pnpm run validate` — PASS (772 files)
- `pnpm run validate:docs` — PASS (147 files)
- `pnpm run architecture:check` — PASS
- `pnpm run architecture:guards` — PASS
- `pnpm run architecture:archaeology` — 0 critical, 0 major, 29 minor
- `pnpm run audit:deep` — PASS (0 findings)
- `integration-graph` / `full-system-assurance` — regenerated, PASS (341 source files)

## Known limitations

- 23 duplicate contracts remain registered as MINOR drift; resolving them is a
  cross-package contract migration requiring integration review, not a cleanup.
- 6 phase documents still carry unsubstantiated implementation claims.
- The capability matrix reads `dist/`; it must run after `build` (as `validate`
  already does via its `turbo build --dry` + archaeology sequencing).
- Live runtime-lab soak / device runs still require CI runners and hardware.
- No CI run has yet executed against this change; **no GitHub issue can be
  honestly closed until a maintainer pushes and CI is green on that SHA.**

## Follow-up

- Collapse the 23 duplicate contracts toward the architecture contract owners.
- Attach source/test/CI citations to the 6 phase documents, or mark them historical.
- Wire `NetworkEventStormGuard` + `ObservationDedupCache` (#283 helpers) into
  daemon ingress and record budget snapshots to telemetry.
