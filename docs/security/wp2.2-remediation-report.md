# WP2.2 Remediation Report — Test-Tool Advisories and Runtime Image Minimization

**Date:** 2026-10-12  
**Baseline:** `bf73303df0c5dbafb37b6724baa1556852585b1b` (`main` at start of work)  
**Implementation branch:** `security/wp2.2-vitest4-runtime-closure` ([PR #10](https://github.com/nimarahimloo/InternetResiliencePlatform/pull/10))  
**Toolchain:** Node.js 24.21.0 (SHA-256 verified), pnpm 11.21.0, TypeScript 6.0.3, PostgreSQL 18.6 (local migration checks)  
**Evidence directory:** [`docs/audits/evidence/2026-10-12-finalization/wp2.2/`](../audits/evidence/2026-10-12-finalization/wp2.2/)

## Summary

| Check                                                        | Result                                                                          | Commit               | Evidence                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| 1. `@irp/failover` build failure under Vitest 4.1.11         | **Reproduced, root-caused, fixed**                                              | `11ba282`            | `check1-*`                                                                                           |
| 2. pnpm 11.21.0 lockfile diff vs approved allow-list         | **PASS** (only approved changes)                                                | `e0f905b`, `3fd570c` | `check2-*`, `lockfile-advisory-packages.txt`                                                         |
| 3. No package installation at container startup              | **Defect found and fixed**                                                      | `3fd570c`            | `check3-4-*`, `runtime-emulation-*`                                                                  |
| 4. `prisma migrate deploy` with production-only dependencies | **PASS**                                                                        | `3fd570c`            | `check3-4-*`                                                                                         |
| Image contents / runtime / scans by digest                   | Verified by CI Docker smoke; digest scan recorded in the CI/release-gate matrix | —                    | [`../release/ci-release-gate-matrix-2026-10-12.md`](../release/ci-release-gate-matrix-2026-10-12.md) |

Checks 2–4 were not accepted on the basis of earlier claims: no WP2.2 commit, branch, PR or output existed on GitHub at the start of this work (`main` = `bf73303`, no newer branch or tag). All four checks were executed from scratch.

## Check 1 — `@irp/failover` build failure

**Reproduction.** With only the Vitest override changed to 4.1.11, `pnpm --filter @irp/failover build` fails:

```text
src/index.ts(1,28): error TS2591: Cannot find name 'node:crypto'.
src/index.ts(2,29): error TS2591: Cannot find name 'node:perf_hooks'.
```

**Root cause.** TypeScript 6 no longer auto-includes every `@types/*` package; only libraries named in `compilerOptions.types` or reached through imports are loaded. `@irp/failover` never declared Node types. At `bf73303` the build succeeded by accident: `src/index.test.ts` (inside the `src/**/*.ts` include) imports `vitest`, Vitest 3.2.7 declarations reach `vite/dist/node/index.d.ts`, and that file carries `/// <reference types="node" />`. `tsc --explainFiles` shows 83 `@types/node` files loaded through that path at `bf73303` and 0 under Vitest 4.1.11, whose public declarations no longer reach Vite's Node entry.

The same latent dependency existed in 16 more packages (`@irp/kernel` failed next once failover was fixed). Turbo `--continue` was used to enumerate every affected package rather than fixing them one by one.

**Fix.** Declare `"types": ["node"]` in the 17 affected package tsconfigs: `apps/cli`, `apps/daemon`, `auth`, `config`, `connectivity`, `core`, `dns`, `failover`, `gateway-registry`, `kernel`, `network`, `network-intelligence`, `plugin-loader`, `plugin-sandbox`, `routing`, `security`, `tunnel`. This matches the existing convention in `linux-client`, `auto-optimization`, `macos-client`, `resilience-runtime` and `windows-client`. No source, test or dependency was changed, and no version was moved to hide the error.

## Check 2 — Lockfile diff

Regenerated with pnpm 11.21.0 (`pnpm install --no-frozen-lockfile`), then verified with `pnpm install --frozen-lockfile` ("Already up to date").

- **Specifier changes (allow-listed):** workspace overrides `vitest` and `@vitest/coverage-v8` 3.2.7 → 4.1.11; root `@vitest/coverage-v8` 3.2.7 → 4.1.11; `network-intelligence` and `resilience-runtime` `@vitest/coverage-v8` `^5.0.2` → `4.1.11` (they were already forced to 3.2.7 by the override; now aligned with the effective version); root `prisma` moved from `devDependencies` to `dependencies` (specifier unchanged, still resolved to 6.19.3 by the existing override).
- **Packages:** 17 added, 46 removed (lists in `check2-lockfile-added.txt` / `check2-lockfile-removed.txt`). Every addition is a Vitest 4 family package or its direct dependency. `tinypool` and `vite-node` leave the graph entirely.
- **Unchanged pins:** `vite` 6.4.3 and `esbuild` 0.25.12 remain the only resolved versions; all other overrides are unchanged.
- **The Prisma move** changes only the root importer entry; the package and snapshot sets are byte-for-byte the same as the Vitest-only lockfile.

## Check 3 — No installation at container startup

**Defect found.** With a production-only dependency tree, every `pnpm run`/`pnpm exec` triggers pnpm 11's dependency status check (`runDepsStatusCheck`), which spawns `pnpm install --production` before running the script. The previous entrypoint ran migrations through `pnpm --filter @irp/database prisma:migrate:deploy`, so a pruned image would install packages at every container start. On the read-only root filesystem from `compose.yaml` that install fails (`EACCES`, exit 243; see `check3-4-F-pnpm-migrate.log`). The check fires regardless of install environment because the recorded workspace state (`dev: false`) never matches the run-time expectation.

The unchanged `bf73303` layout (full dev tree) did not trigger it; the defect only appears once the image is minimized, which is why it had to be solved together with WP2.2b.

**Fix.**

- `scripts/runtime-entrypoint.mjs` runs `node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma` directly. pnpm is no longer in the startup path.
- Dockerfile `prod-deps` stage: discards every build-stage `node_modules`, then runs `pnpm install --frozen-lockfile --prod --offline` with `NODE_ENV=production`. Installation happens only at image build time, from the frozen lockfile and the populated store; `--offline` fails closed. A fresh tree is used because an in-place `--prod` prune keeps orphaned virtual-store entries (pnpm `modulesCacheMaxAge`, 7 days by default) and stale `.bin` shims: measured, an in-place prune still left `vitest`, `vite`, `esbuild`, `tinypool` and `vite-node` directories.
- Root `prepare` runs `.husky/install.mjs` (the husky-documented pattern), which skips hook installation when `NODE_ENV=production` or `CI=true` instead of failing because `husky`, a devDependency, is absent from the production closure.
- `scripts/docker-smoke.sh` now asserts inside the real container: direct Prisma CLI, schema and migrations present, no dev-only packages under `node_modules/.pnpm`, and no `pnpm install` / lockfile / `ERR_PNPM` lines in the API logs.

**Local proof (no Docker daemon available; equivalent tree).** Production tree installed exactly as the `prod-deps` stage does (227 packages, both Prisma engines present, only the `prisma` shim in `.bin`). `node_modules` made read-only. The entrypoint reached ready in 3 s; `/api/v1/health`, `/live`, `/ready`, `/platform/status` returned 200; `scripts/healthcheck.mjs` exited 0; SIGTERM produced a clean shutdown (exit 0). The `execve` trace shows only `node`, the local Prisma schema engine and the app's own `ping` probes — no `pnpm` process and no install.

## Check 4 — Production migration

Against PostgreSQL 18.6 with the production-only, read-only tree:

- `prisma migrate deploy` applies all five migrations (`20260714083800_phase_5_core` … `20261004000000_phase_274_conflict_journal`), all recorded as finished in `_prisma_migrations`.
- The same command inside a network namespace with no connectivity (verified `EAI_AGAIN`), connecting over the PostgreSQL Unix socket, succeeds — no engine download or registry access is needed at runtime.
- A second run reports `No pending migrations to apply.` (idempotent).
- Prisma CLI 6.19.3 resolves from the root production dependency; `@prisma/engines` 6.19.3 provides `schema-engine-debian-openssl-3.0.x` and `libquery_engine-debian-openssl-3.0.x.so.node` in the closure.

## Vitest 4 regression evidence

Only one test needed a change: `packages/resilience-runtime/tests/postgres-store-274.test.ts` mocks `pg.Pool` with `vi.fn(() => mockPool)`; Vitest 4 invokes `vi.fn` implementations with `new` semantics, which arrow functions cannot satisfy. The mock now uses `vi.fn(function () { return mockPool; })`, which returns the same object; assertions are unchanged.

| Gate (local, Node 24.21.0 / pnpm 11.21.0)            | `bf73303` baseline | WP2.2 final tree |
| ---------------------------------------------------- | ------------------ | ---------------- |
| `pnpm validate`                                      | PASS               | PASS             |
| `turbo run typecheck --force`                        | PASS               | PASS             |
| `turbo run lint --force`                             | PASS               | PASS             |
| `turbo run build --force`                            | PASS               | PASS             |
| `turbo run test --force`                             | PASS               | PASS             |
| `turbo run test -- --coverage`                       | not run            | PASS             |
| `pnpm examples:smoke`                                | not run            | PASS             |
| `architecture:check` / `:guards` / `:test`           | PASS               | PASS             |
| `certification:test`, `bundle:test`, `validate:docs` | PASS               | PASS             |
| Test files passed (+ skipped)                        | 141 (+1)           | 141 (+1)         |
| Tests passed (+ skipped)                             | 1175 (+2)          | 1175 (+2)        |

The skipped file and tests (`@irp/linux-client`) are pre-existing conditional skips present at `bf73303`. Per-package counts are identical.

## Advisory disposition

| Advisory                       | Package / range                              | `bf73303` (`pnpm audit`) | WP2.2 (`pnpm audit`, full + `--prod`) |
| ------------------------------ | -------------------------------------------- | ------------------------ | ------------------------------------- |
| GHSA-82fw-gwwq-j7x9 (moderate) | `vitest`, `@vitest/mocker` `>=2.1.0 <4.1.11` | present (3.2.7)          | **resolved** (4.1.11)                 |
| GHSA-5gmw-xhrv-c9v3 (critical) | `tinypool` `<=2.1.0`                         | present (1.1.1)          | **resolved** (not in graph)           |
| GHSA-85c8-ppgw-ccpr (critical) | `tinypool` `<2.1.2`                          | present (1.1.1)          | **resolved** (not in graph)           |

Audit totals: baseline 2 moderate + 2 critical; WP2.2 0 at every severity, for both the full and production graphs (`audit-baseline.json`, `audit-all.json`, `audit-prod.json`).

## Residuals

- pnpm itself is still copied into the runtime image (`/pnpm`), and `docker-smoke.sh` still checks `pnpm --version`. The runtime no longer invokes it. Removing it would change the documented runtime contract (`/app/.local/share/pnpm` tmpfs); this is tracked as follow-up rather than changed silently.
- `typescript` 6.0.3 remains in the production closure as a peer of `prisma`.
- `@irp/gateway-registry` resolves `@types/node` from the workspace root rather than declaring it locally.
