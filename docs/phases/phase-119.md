# Phase 119 — Tenant / Organization Isolation

## Status

**PARTIAL — not complete.** The supplied Phase 119 patch reports local verification of the runtime store and API tenancy path,
including PostgreSQL, on original code commit `275f703b`. This follow-up branch applies the changes as a new commit;
the reported results have not been independently rerun against that commit. Exact-head CI and owner review remain pending.
No live or production-environment validation is claimed.

## Objective

Guarantee tenant isolation with mandatory context, partitioned storage, quotas and audited cross-tenant denial.

## Dependencies

- Phase 109 — Authorization / Capability Model
- Phase 114 — Fleet Management Foundation

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/fleet/tenant-isolation.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Tenant-partitioned storage with no all-tenants read.
- Per-tenant quotas.
- Cross-tenant violations audited.

## Non-goals

- Billing or tenant provisioning.

## Evidence map

| Criterion | Location |
| --- | --- |
| Cross-tenant access is denied and logged. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Quotas are enforced per tenant. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| A tenant context is mandatory. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |

## Acceptance criteria

1. Cross-tenant access is denied and logged.
2. Quotas are enforced per tenant.
3. A tenant context is mandatory.

## API tenancy path

The runtime store above has no consumer in the API. Persistent organizations, projects and workspaces (PR #557)
are isolated by their canonical owner, `apps/api/src/tenancy/routes.ts` and `apps/api/src/identity/`. This phase
extends that path; it adds no second tenancy system or authorization engine. Contract:
[`docs/api/organizations.md`](../api/organizations.md).

No schema or migration change. All checked-in migrations were applied to an empty database, and the columns,
indexes and foreign keys of the tenancy tables were compared with the schema by reading them.

### Evidence

Tests are in `apps/api/src/tenancy-postgres.integration.test.ts` and run on memory and PostgreSQL unless noted.

| Check | Result | Evidence (test name) and limits |
| --- | --- | --- |
| Cross-tenant access denied | Met | "denies and audits every direct-id request from another tenant"; "rechecks the actor inside every write" |
| Tenant context mandatory | Met with limit | Reads, lists and writes take a scope. Ownership transfer is guarded by the expected owner instead; membership lookups are keyed by organization id |
| Denial auditable | Met | "audits role and foreign-parent denials, but not unknown ids"; survives restart (PostgreSQL). No HTTP read endpoint; a stale ownership transfer returns 409 without an audit row |
| Quotas enforced | Met | "enforces per-organization quotas, also under concurrency" |
| Ownership and membership permissions | Met | Role tests; concurrent transfer, revoked-in-flight, removal under continuous writes and unknown-role tests (the last three PostgreSQL only) |
| Project and workspace inheritance | Met | Access is resolved from the owning organization on every request |
| Platform administrator access | Met as designed | Owner-level access to every live organization. Not rechecked inside the transaction, successful admin access is not audited, and no admin-specific route matrix exists |
| Direct resource id | Met | The route matrix is compared with the OpenAPI paths |
| Archive | Met | Cascade and archive/create race tests; children of parents archived by older data are hidden and not counted (PostgreSQL) |
| Persistence and multiple instances | Met locally | Restart and two-instance tests on PostgreSQL 16.15 |
| No silent overwrite | Met for updates | `PATCH` requires `expectedUpdatedAt`. Archive and ownership transfer take no record version |
| Scoped paging, sorting, filtering, lookup | Met | "scopes lists, search, sorting, paging and totals to the caller" |

### Local verification as recorded by the supplied patch (original commit `275f703b`, 2026-11-27, Node 24.22.3)

| Command | Result |
| --- | --- |
| `pnpm build`, `lint`, `typecheck` | pass |
| `pnpm validate`, `validate:test`, `validate:docs`, `architecture:check`, `architecture:test` | pass |
| `pnpm phase71:test`, `certification:test`, `examples:smoke` | pass |
| `cd apps/api && CI=true IRP_TEST_DATABASE_URL=… npx vitest run` | 245/245 pass, 24 files, PostgreSQL 16.15 |
| `cd packages/resilience-runtime && npx vitest run tests/phase-114-120-fleet.test.ts` | 18/18 pass |
| `pnpm exec turbo run test --continue --force --concurrency=4 --env-mode=loose` | **fail**: 87/88 tasks; `@irp/gateway-registry` "closes the socket when the connection times out" |

The failing test is in a package this phase does not touch and depends on the sandbox network; the supplied patch says it
passed in GitHub CI when checked on 2026-11-26. Some suites in the full run skip tests that need other environments.
`prisma validate` and the migration drift check did not run locally (engine download blocked).

## Verification boundary

- Local runs above and the existing CI once the follow-up head is pushed.
- No claim of live-environment, device or production validation until exact-SHA CI and runtime evidence exist.

## Remaining before completion

- A passing CI result for the exact follow-up commit.
- Owner approval of the breaking `PATCH` change and the quota defaults.

## Rollback considerations

- No migration and no data rewrite: reverting the commits restores the previous behaviour. Audit rows written
  meanwhile remain.
- Clients that adopted `expectedUpdatedAt` keep working after a revert; organization, project and workspace
  updates already accepted it (member updates did not, and would reject it).

## Related issues

- Tracking: open roadmap workstream
- External blockers remain in issues #254, #272, #284 and #323
