# Production Readiness Report (2026-11-01)

**Verdict: the platform is NOT certified production-ready.** This report separates what was verified from what was not.

## Full-repository test evidence

`pnpm test` (turbo) at the working tree of branch `fix/durable-identity-auth`, in the audit sandbox with `iproute2`, network-namespace capability and PostgreSQL 16 available: **86/86 tasks successful**. The same command at baseline `200de48` in a sandbox without `iproute2` failed one `@irp/daemon` test (D11). These are local results; **no exact-SHA GitHub Actions run exists for this branch yet** (`BLOCKED_EXTERNAL` until pushed and CI runs).

## By subsystem

| Subsystem                                                                                        | Status                                          | Verified                                                                                                        | Unverified / risk                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Identity persistence                                                                             | `INTEGRATION_VERIFIED`                          | Real PostgreSQL 16: two instances consistent, survives restart, atomic concurrent refresh, migration up/down/up | Not run against managed/staging PostgreSQL with TLS; pool unification (REMAINING #8)                                    |
| Authentication lifecycle                                                                         | `INTEGRATION_VERIFIED`                          | Register→verify→login→refresh→rotate→logout→revoke; reset; replay; expiry; lockout; concurrency; audit rows     | Real email delivery `BLOCKED_EXTERNAL`; `trustProxy` unset (REMAINING #4); register still reveals existing emails (#19) |
| Distributed rate limiting                                                                        | `INTEGRATION_VERIFIED` for identity/auth routes | Shared budget across two instances                                                                              | `unified-product-api.ts` still per-process (#5)                                                                         |
| Tenant isolation                                                                                 | `INTEGRATION_VERIFIED` (owner-level)            | SQL-scoped reads/writes, cross-tenant project reference rejected                                                | Multi-member orgs not implemented (#7)                                                                                  |
| Fail-closed startup                                                                              | `TESTED`                                        | Production/staging refuse without `DATABASE_URL` and without HTTPS email relay                                  | Other stores (event bus/queue) not audited (#6)                                                                         |
| Production PostgreSQL infra                                                                      | `BLOCKED_EXTERNAL`                              | none                                                                                                            | TLS, roles, backups, restore rehearsal, saturation                                                                      |
| Linux data plane                                                                                 | `PARTIAL`                                       | Real-kernel (netns) crash-recovery test passes; capability gating fails closed                                  | Full observation→commit chain with destination verification not traced or proven; systemd execution unverified          |
| CodeQL / security CI                                                                             | `PARTIAL`                                       | Workflow inspected                                                                                              | Default-vs-Advanced conflict is a repo setting; Swift absent from matrix; real results unchecked                        |
| Release / supply chain                                                                           | `NOT_STARTED` (in this audit)                   | none                                                                                                            | Docker provenance, SBOM, signing, release/tag reconciliation                                                            |
| macOS, Windows, Android, iOS clients                                                             | `NOT AUDITED`                                   | none                                                                                                            | native vs mocked behaviour unknown                                                                                      |
| Other platform domains (intelligence, intent/policy, fabric, optimisation, learning, federation) | `NOT AUDITED`                                   | none                                                                                                            |                                                                                                                         |

## Security and operational risks to track

1. Behind a proxy, rate limiting and lockout currently key on the proxy address until `trustProxy` is configured.
2. A legitimate client that retries a refresh after a lost response will trigger family revocation (secure default, user-visible).
3. Dev mode (`development-memory`) is non-durable by design; it is unreachable in production/staging.
4. Two pools per process (`createPrismaClient` + `createSqlClient`) double connection use on serverless until unified.
5. Audit and security tables have no retention job yet.

## What is required before any production-ready claim

All P0 items in `REMAINING_WORK.md`, a green exact-SHA CI run, CodeQL working, a restore rehearsal, and an end-to-end Linux chain proof.
