# Phase 21 Findings

## P21-001 — P1 High

- **ID:** P21-001
- **Severity:** P1 High
- **Phase:** Phase 21
- **Subsystem:** format
- **File:** apps/api/src/index.ts; docs/phases/phase-19/*; examples/phase-19/phase19-result.json
- **Approximate location:** prettier check
- **Problem:** Repository format gate fails on four pre-existing files.
- **Impact:** CI/quality gate cannot be green.
- **Reproduction:** pnpm exec prettier --check .
- **Recommended fix:** Run Prettier in a dedicated formatting fix after audit approval.
- **Blocker?:** Yes

## P21-002 — P1 High

- **ID:** P21-002
- **Severity:** P1 High
- **Phase:** Phase 19
- **Subsystem:** coverage
- **File:** packages/network-intelligence/src/*
- **Approximate location:** coverage thresholds
- **Problem:** Coverage command fails because network-intelligence function coverage is 88.28% (<90) and branch coverage is 76.34% (<80).
- **Impact:** Coverage gate is broken even though unit tests pass.
- **Reproduction:** pnpm coverage
- **Recommended fix:** Add targeted tests for Retry/Scheduler/NetworkMonitor/DecisionEngine branches; do not lower thresholds.
- **Blocker?:** Yes

## P21-003 — P1 High

- **ID:** P21-003
- **Severity:** P1 High
- **Phase:** Phase 20
- **Subsystem:** Electron desktop
- **File:** apps/desktop/src/main/demo-data.ts; apps/desktop/package.json
- **Approximate location:** runtime integration
- **Problem:** Desktop depends on demo fixtures and reports backend control API unavailable; runtime launch was not verified in this audit environment.
- **Impact:** Desktop is not a verified live client for backend/control subsystems.
- **Reproduction:** Inspect demo-data and run desktop dev/package commands.
- **Recommended fix:** Add real backend connector or explicitly gate demo-only mode in a later phase.
- **Blocker?:** Yes

## P21-004 — P1 High

- **ID:** P21-004
- **Severity:** P1 High
- **Phase:** Phases 14-19
- **Subsystem:** integration
- **File:** packages/dns/src/index.ts; packages/routing/src/index.ts; packages/tunnel/src/index.ts; packages/network-intelligence/src/decision/NetworkDecisionEngine.ts
- **Approximate location:** call graph
- **Problem:** DNS/routing/tunnel/AI packages build and test independently but are not wired into backend API or desktop as live services.
- **Impact:** Major subsystem completion cannot be claimed beyond library-level behavior.
- **Reproduction:** rg imports from apps/api apps/desktop packages/*
- **Recommended fix:** Create integration layer and end-to-end runtime tests in a future remediation phase.
- **Blocker?:** Yes

## P21-005 — P2 Medium

- **ID:** P21-005
- **Severity:** P2 Medium
- **Phase:** Phase 7
- **Subsystem:** tests
- **File:** packages/plugin-config; packages/plugin-runtime and other packages
- **Approximate location:** test discovery
- **Problem:** Several packages use vitest --passWithNoTests and report success with no test files.
- **Impact:** Test status overstates actual coverage.
- **Reproduction:** pnpm test output
- **Recommended fix:** Require tests for non-trivial packages or remove test scripts that pass without tests.
- **Blocker?:** No

## P21-006 — P2 Medium

- **ID:** P21-006
- **Severity:** P2 Medium
- **Phase:** Phase 18
- **Subsystem:** security
- **File:** apps/api/src/index.ts
- **Approximate location:** configuration
- **Problem:** API falls back to a development JWT secret outside tests when JWT_SECRET is unset.
- **Impact:** Unsafe default can reach non-production runtime if env is misconfigured.
- **Reproduction:** rg JWT_SECRET apps/api/src/index.ts
- **Recommended fix:** Fail startup without explicit JWT_SECRET except NODE_ENV=test/development.
- **Blocker?:** No

## P21-007 — P2 Medium

- **ID:** P21-007
- **Severity:** P2 Medium
- **Phase:** Phase 4
- **Subsystem:** tests
- **File:** packages/core/src/index.test.ts
- **Approximate location:** test quality
- **Problem:** Contains expect(true).toBe(true), a superficial assertion.
- **Impact:** Test suite includes a non-behavioral assertion.
- **Reproduction:** rg "expect\(true\)" packages/core/src
- **Recommended fix:** Replace with behavioral assertion.
- **Blocker?:** No

## P21-008 — P2 Medium

- **ID:** P21-008
- **Severity:** P2 Medium
- **Phase:** Phase 5
- **Subsystem:** database
- **File:** packages/database/prisma/schema.prisma; packages/database/src/index.ts
- **Approximate location:** database verification
- **Problem:** Schema/migration exist but no real database migration/runtime connection was verified; tests use client abstraction.
- **Impact:** Persistence readiness is not proven.
- **Reproduction:** pnpm test; inspect database package
- **Recommended fix:** Run migrations against disposable DB and add integration tests.
- **Blocker?:** No

## P21-009 — P3 Low

- **ID:** P21-009
- **Severity:** P3 Low
- **Phase:** Docs
- **Subsystem:** documentation
- **File:** docs/phases/phase-19/preflight-audit.md; docs/phases/phase-20/preflight-audit.md
- **Approximate location:** documentation drift
- **Problem:** Prior reports mark phases complete where Phase 21 found demo-only or unverified integration.
- **Impact:** Documentation overstates readiness.
- **Reproduction:** Compare docs to runtime/integration evidence.
- **Recommended fix:** Update prior summaries or add caveats.
- **Blocker?:** No
