# Clean-State Validation Evidence — 2026-10-06

Supports issues **#323** (Final External Validation Gate), **#284** (Full Verification
workstream) and **#272** (master epic). This records the locally-executable gate that
all three issues list as an open task:

> Run the repository from a clean state with `pnpm clean` followed by the complete
> validation/typecheck/lint/test suite.

## Baseline and environment

- Baseline commit reviewed: `7f8e80559df67fcf43f8fbfc3962b2064b98a185` (`main`)
- Latest implementation merge observed: PR #324 (`security/review-fixes-2026-10-05`)
- Date: 2026-10-06
- Package manager: pnpm 11.21.0
- Node runtime used locally: **v22.23.2**
  - **Caveat (disclosed):** `package.json` `engines` requires `node >=24.0.0`. Every gate
    below was executed on node v22.23.2 and passed, emitting a non-fatal
    `Unsupported engine` warning. CI workflows pin `node-version: '24'`. The green local
    result therefore does not substitute for a green remote CI run on node 24.

## Clean-state procedure

```text
pnpm clean                       # removed coverage, .turbo, dist, node_modules
pnpm install --frozen-lockfile   # Done in 3.4s (pnpm store cache; lockfile unchanged)
```

`pnpm clean` removed the turbo cache (`.turbo`), so the first turbo gate recompiled from
zero. `pnpm typecheck` reported **`Cached: 0 cached, 79 total`**, proving a genuine
clean-state recompilation rather than a cached replay.

## Core gates (all passed, exit code 0)

| Gate | Result |
| --- | --- |
| `pnpm validate` | passed — 43 packages, 15 workflows, 819 files |
| `pnpm validate:docs` | passed — 147 Markdown/MDX files inspected |
| `pnpm architecture:check` | Architecture contract validation passed |
| `pnpm architecture:guards` | All architecture guards passed |
| `pnpm architecture:test` | 2/2 tests passed |
| `pnpm typecheck` | 79/79 tasks, **0 cached** (clean recompile) |
| `pnpm lint` | 79/79 tasks |
| `pnpm build` | 43/43 tasks |
| `pnpm test` | 86/86 tasks |

`@irp/resilience-runtime` alone: 49 test files, 663 tests, all passing.

## Extended evidence gates (all passed, exit code 0)

| Gate | Result |
| --- | --- |
| `pnpm audit:deep` | 43 workspaces, 15 workflows, **0 findings** |
| `pnpm integration:graph` | 43 components, 10 closed-loop stages, 28 real-environment capabilities (all fail-closed until evidence) |
| `pnpm full-system:matrix` | **PASS** — 222 components/phases, 380 source files, 0 missing phase docs, 0 executable surfaces without assurance |
| `pnpm architecture:archaeology` | complete — 0 critical, 0 major, 29 minor drift; 0 orphaned tests, 0 orphaned modules |
| `pnpm runtime:integration` | exit 0 — all 43 package integrations executed |

## Known advisory findings (not blocking)

- **29 minor drift findings** (archaeology): 23 `duplicate-contract` and 6
  `unsubstantiated-phase-claim` (`docs/phases/phase-46/54/66/75/76/80.md`). These are
  pre-existing, advisory, and tracked in `artifacts/archaeology/drift-register.md`.
  Only `critical` drift blocks the archaeology gate; none is present.
- **Coordination-record behind-head** (archaeology `phase-audit.json`): `PROJECT_STATE.md`
  and `.github/ACTIVE_WORK.md` pinned `8f598af…`, a strict ancestor of `main`. This is the
  coordination-document drift that #272 lists as a known gap. This same change re-pins both
  records to the actual reviewed main commit `7f8e805…` and the actual latest merge PR #324.

## What this evidence does and does not establish

**Established (locally, reproducibly):** the complete validation/typecheck/lint/test suite
passes from a clean state on the reviewed baseline, with no skipped, weakened or hidden
checks and no artificial green.

**Not established by this artifact (genuine external dependencies, per #323):**

1. A successful **remote GitHub Actions** run for the final `main` SHA on node 24.
2. The **Linux Primary Device/runtime gate** on a runner with `CAP_NET_ADMIN` (#254).
3. Real **Linux data-plane/runtime-lab soak** evidence for the canonical closed loop.
4. **Deployment/package/startup/readiness/shutdown** evidence on the target environment.
5. **Release/distribution** evidence: tag, published artifacts, `SHA256SUMS.txt`, asset inspection.

These remain open and must not be represented as complete. Per #323: "Do not close this
issue until the evidence above is real and reproducible."
