# End-to-End Integration Baseline

## Purpose

The integration baseline is a permanent engineering gate for InternetResiliencePlatform. It answers a narrower question than production certification:

> Are the repository's canonical workspace dependencies connected, is the canonical resilience runtime executable, and does the deterministic closed loop execute end-to-end?

It does **not** claim that clients, gateways, DNS, tunnels, devices, regional networks, backup/restore, upgrade/rollback, or production infrastructure have been exercised in a real environment. Those remain governed by the full-system real-environment assurance registry and production certification evidence.

## What the gate verifies

1. Every `workspace:*` dependency resolves to an inventoried workspace package/app.
2. The canonical `@irp/resilience-runtime` package exists.
3. Required runtime integration edges are declared.
4. The complete workspace build succeeds.
5. The strict runtime package-integration test succeeds.
6. The canonical resilience-runtime deterministic E2E validation succeeds.
7. The closed-loop stages `observe → measure → detect → diagnose → decide → policy → apply → verify → recover` are covered by executable validation.

## Truth boundary

A dependency declaration is not proof of runtime behavior. A deterministic adapter is not production evidence. The gate therefore reports only what it actually executes and leaves real-environment assurance separate and fail-closed.

A component with missing real-environment evidence remains `PENDING`/`BLOCKED`; it is never promoted to production PASS by this gate.

## Command

```bash
pnpm integration:baseline
```

The command is intentionally fail-closed. Any unresolved workspace dependency, missing required edge, build failure, runtime integration failure, or deterministic closed-loop failure exits non-zero.

## Relationship to other gates

- **CI**: repository quality and security checks.
- **System Assurance**: canonical deterministic runtime assurance.
- **Integration Baseline**: connectivity contract + executable closed-loop baseline.
- **Full-System Assurance**: inventory and explicit real-environment assurance boundary for all executable surfaces.
- **Phase 70 / Production Certification**: final evidence-backed production certification.

These gates are complementary; none may be weakened to compensate for another failing gate.
