# InternetResiliencePlatform — Canonical Project State

> This file is the human-maintained handoff point for continuing development from any account, agent, or future session.

## Current State

- **Highest implemented phase:** Phase 43 — Distributed Probe Federation
- **Current phase:** Phase 43 — verification gate
- **Phase 42 status:** implementation and dedicated API/test/docs work are present on `main`.
- **Phase 43 status:** implementation committed; CI/runtime completion evidence is still pending.
- **Next phase:** Phase 44 — Destination Policy & Network Identity Assurance, after Phase 43 verification passes.
- **Roadmap:** 48 phases total.
- **Product mode:** Headless/core-first.
- **UI/Desktop scope:** Removed; do not reintroduce unless explicitly requested.
- **README policy:** Keep the root README concise and entry-point focused; detailed architecture, procedures, reference material, and phase history belong under `docs/`.

## Phase 43 — Distributed Probe Federation

Implemented in commit `45e81dd95a55920030e7f548730f6aed5d7af2da`:

- Ed25519 probe identity and public-key registration.
- Canonical signed evidence envelopes.
- Replay protection using evidence IDs and payload fingerprints.
- Clock-skew and evidence-age validation.
- Per-probe and global bounded evidence capacity.
- Probe registration, inspection and revocation API.
- Signed evidence ingestion API.
- Destination-level regional comparison.
- Bounded network measurements and federation statistics.
- Unit coverage for valid signatures, tampering, replay, revocation and cross-region comparison.
- Headless mobile-client usage documentation.

The federation layer is evidence-only. It does not itself select VPNs, proxies or routes.

## Mobile Client

The product remains headless. iOS/Android clients consume the HTTPS control plane rather than embedding the resilience engine.

Provisioning uses the Phase 42 remote-client lifecycle:

- administrator enrolls a device;
- phone exchanges the one-time device credential for a short-lived access token;
- phone uses the rotating refresh-token flow;
- API scopes bound the phone to read/inspect operations unless explicitly elevated by an administrator.

See `docs/mobile-client.md`.

## Verification Rules

A phase is not complete because source files exist. Completion requires its acceptance criteria plus repository verification and, where relevant, runtime/online evidence.

For Phase 43, completion requires repository validation, typecheck, tests, build, API/example smoke and Docker/runtime CI gates. Independent regional operation additionally requires independently hosted probes with independently verifiable egress.

## Continuation Rules

1. Read `ROADMAP.md` and this file before starting work.
2. Determine the highest phase whose acceptance criteria are genuinely complete.
3. Never assume a phase is complete merely because source code exists.
4. Resume from the current phase when its verification gate is failing.
5. Only advance to the next phase after the current phase is verified.
6. Inspect existing implementation before creating duplicate modules or abstractions.
7. Preserve backward-compatible contracts unless the roadmap phase explicitly requires a breaking change.
8. Prefer production-grade fixes over test-only workarounds.
9. Do not add UI/dashboard/Electron/mobile UI work; clients consume the headless control/data plane.
10. Keep security, policy, destination-awareness, application-level verification, failover safety, auditability and rollback as first-class requirements.
11. Never infer regional egress from the destination being tested; prove it from the probe's observed public IP.

## Product Objective

The core agent must autonomously:

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn
```
