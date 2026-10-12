# Security and Dependency Disposition — 2026-10-12

**Scope:** dependency advisories, secret scanning, container/runtime security posture for the WP2.2 change set (`11ba282`…`72ea75f`) against baseline `bf73303`.  
**Evidence:** [`docs/audits/evidence/2026-10-12-finalization/`](../audits/evidence/2026-10-12-finalization/)

## Dependency advisories

| Source                            | Baseline `bf73303`                                 | After WP2.2         |
| --------------------------------- | -------------------------------------------------- | ------------------- |
| `pnpm audit` (full graph)         | 2 moderate, 2 critical                             | 0 at every severity |
| `pnpm audit --prod`               | not affected (dev-only advisories)                 | 0 at every severity |
| GitHub Dependency Review (PR #10) | failed on every fork PR: dependency graph disabled | enabled; **pass**   |

| Advisory                                                                 | Severity | Affected                                     | Disposition                                    |
| ------------------------------------------------------------------------ | -------- | -------------------------------------------- | ---------------------------------------------- |
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | moderate | `vitest`, `@vitest/mocker` `>=2.1.0 <4.1.11` | **Resolved** — 4.1.11                          |
| [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | critical | `tinypool <=2.1.0`                           | **Resolved** — tinypool no longer in the graph |
| [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | critical | `tinypool <2.1.2`                            | **Resolved** — tinypool no longer in the graph |

All three were dev/test-tool advisories; none was reachable from the production runtime at baseline, and after WP2.2b the runtime image no longer contains any test tooling at all.

## Runtime closure (WP2.2b)

- Runtime `node_modules` is a fresh production-only install (`--frozen-lockfile --prod --offline`): 227 packages. Absent: `vitest`, `vite`, `vite-node`, `tinypool`, `esbuild`, `eslint`, `turbo`, `typescript-eslint`, `prettier`, `husky`, `@vitest/coverage-v8` — asserted inside the container by `scripts/docker-smoke.sh`.
- No package installation at startup: the entrypoint invokes the Prisma CLI directly; the API log is asserted to contain no `pnpm install` / lockfile / `ERR_PNPM` lines.
- Still present by design: `prisma` 6.19.3 and `@prisma/engines` (production migrations), `typescript` 6.0.3 (peer of `prisma`), the pnpm binary under `/pnpm` (no longer invoked at runtime; follow-up tracked).

## Database availability (found during this work)

A pre-existing defect let any PostgreSQL restart terminate the API (unhandled pool `error` event). Fixed in `72ea75f`; see [`wp2.2-remediation-report.md`](wp2.2-remediation-report.md) and the `db-outage-*` evidence logs. This is an availability fix with security relevance (trivial remote-triggerable denial of service whenever the database connection drops).

## Secret scanning

[Gitleaks](https://github.com/gitleaks/gitleaks) 8.30.1 (release checksum verified) over the full history (1814 commits) and the working tree. GitHub secret scanning and push protection are enabled on the repository.

| Finding              | Location                                                                                                            | Disposition                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `generic-api-key` ×3 | `.github/workflows/ci.yml`                                                                                          | CI-only smoke values (`irp_smoke_*`), not credentials           |
| `generic-api-key`    | `tools/runtime-lab/package-e2e.mjs`                                                                                 | e2e test secret literal                                         |
| `generic-api-key`    | `packages/auth/src/index.test.ts`                                                                                   | unit-test signing key                                           |
| `jwt` ×2             | `packages/resilience-runtime/tests/security-278.test.ts`                                                            | test-fixture tokens                                             |
| `private-key`        | `packages/network-intelligence/src/providers/__fixtures__/localhost-test-key.pem` (commit `8fa83eb`, since removed) | localhost TLS test fixture; must never be trusted outside tests |

No production credential was found. The redacted report is `gitleaks-history-redacted.json`.

## Container image scanning

There is no image scanner in CI (`docker-publish.yml` signs with cosign and attaches an SBOM only). The published image is scanned by digest with Trivy after Docker Publish runs; results and the digest are recorded in [`../release/ci-release-gate-matrix-2026-10-12.md`](../release/ci-release-gate-matrix-2026-10-12.md). Adding a fail-closed image scan to CI is tracked in the remaining-work register.
