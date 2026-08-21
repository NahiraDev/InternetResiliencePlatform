# InternetResiliencePlatform — Canonical Project State

> This file is the machine-readable human-maintained handoff point for continuing development from any account, agent, or future session.

## Current State

- **Highest merged phase:** Phase 40 — End-to-End Internet Resilience Validation
- **Current phase:** Phase 41 — External Regional Validation
- **Phase 40 status:** implementation merged; CI/runtime completion evidence not independently confirmed by the connected workflow-run API
- **Phase 41 status:** initial online regional IP validation tooling implemented; independent Iranian-vantage verification pending
- **Next phase:** Phase 42 — Remote Client API Integration
- **Roadmap:** 48 phases total
- **Product mode:** Headless/core-first
- **UI/Desktop scope:** Removed; do not reintroduce unless explicitly requested
- **README policy:** Do not modify README.md unless explicitly requested by the user

## Phase 40 Result

Phase 40 was merged through PR #128 on `main` with deterministic end-to-end resilience validation infrastructure. The harness covers healthy operation, DNS/application degradation, persistent-provider recovery, destination-specific evidence, apply-boundary fault injection, verification failure and recovery handling. fileciteturn70file0

The implementation is present, but the connected workflow-run API did not expose a CI run for merge commit `0fbd272d8e0811e701dfc2a39a65a4f7e7619aff`. Therefore the repository does not currently claim Phase 40 as fully verified until direct CI evidence is available.

## Phase 41 — External Regional Validation

Phase 41 introduces an explicit online regional validation contract.

Implemented:

- `scripts/regional-online-test.mjs`
- `pnpm regional:online`
- configurable HTTPS regional probe endpoint;
- expected-country validation, default `IR`;
- bounded timeout and redirect rejection;
- structured JSON result containing observed public IP/country and optional regional metadata;
- distinct exit codes for pass, country mismatch and transport/validation failure;
- `docs/phases/phase-41.md` implementation and verification contract.

### Iranian-vantage requirement

An Iranian result must come from the egress of an actual independent Iranian network vantage point. A GitHub runner or workstation outside Iran must never be labelled as Iranian simply because it tested an Iranian destination.

Run:

```bash
IRP_REGIONAL_PROBE_URL=https://<trusted-iranian-probe>/identity \
IRP_EXPECTED_COUNTRY=IR \
pnpm regional:online
```

The probe endpoint must return at least `ip` and `country`/`country_code`.

Public geolocation services support returning the request-origin public IP and country, making them suitable as one component of this evidence path. citeturn543801search0turn543801search2turn543801search7

## Roadmap Extension — Phases 41–48

The repository's previous roadmap ended at Phase 40. No authoritative Phase 41–48 specification was present in the repository history at the time of this extension. The following extension is now the canonical roadmap and is explicitly derived from the existing product direction rather than presented as recovered historical text.

- **41 — External Regional Validation:** online public-IP identity and regional service validation.
- **42 — Remote Client API Integration:** connect Phase 39 device credentials and rotating refresh sessions to real API lifecycle routes.
- **43 — Distributed Probe Federation:** multiple independent regional probes and bounded evidence aggregation.
- **44 — Destination Policy & Network Identity Assurance:** stronger geo/destination policy evaluation and direct/local identity preservation.
- **45 — Adaptive Provider Learning:** combine historical, regional and destination evidence into bounded learning and confidence updates.
- **46 — Long-Duration Chaos & Soak Validation:** multi-hour/day resilience, resource stability, anti-flapping and convergence testing.
- **47 — Production Release & Upgrade Safety:** release, migration, compatibility, rollback and supply-chain certification.
- **48 — v1.0 Continuous Resilience Certification:** final production certification with continuous post-release validation.

## Verification Rules

A phase is not complete because source files exist. Completion requires the phase-specific acceptance criteria plus repository verification and, where relevant, runtime/online evidence.

For online regional validation, the evidence must identify the observed egress IP and country. Geolocation is evidence, not an absolute statement of physical location; accuracy can vary by network type and region. citeturn492492academia31

## Continuation Rules

1. Read `ROADMAP.md` and this file before starting work.
2. Determine the highest phase whose acceptance criteria are genuinely complete.
3. Never assume a phase is complete merely because source code exists.
4. Resume from the current phase when its verification gate is failing.
5. Only advance the next phase after the current phase is verified.
6. Inspect existing implementation before creating duplicate modules or abstractions.
7. Preserve backward-compatible contracts unless the roadmap phase explicitly requires a breaking change.
8. Prefer production-grade fixes over test-only workarounds.
9. Do not add UI/dashboard/Electron/mobile UI work; clients consume the headless control/data plane.
10. Do not modify README.md unless the user explicitly asks for a README change.
11. Keep security, policy, destination-awareness, application-level verification, failover safety, auditability and rollback as first-class requirements.
12. For regional validation, never infer Iranian egress from the destination being tested; prove it from the probe's observed public IP.

## Product Objective

The core agent must autonomously:

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn
```
