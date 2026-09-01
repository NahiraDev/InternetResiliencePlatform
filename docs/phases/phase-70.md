# Phase 70 — IRP v1.0 Production Certification

## Goal

Establish a machine-readable, fail-closed certification gate for IRP v1.0. Certification covers Core, API, gateways, web, Linux, macOS, Windows, iOS and Android and requires repository, runtime, security, recovery, regional, accessibility, localization and release evidence.

## Scope

- Versioned Phase 70 certification manifest.
- Deterministic certification-contract verifier.
- Explicit evidence inventory for every supported platform and production gate.
- Fail-closed workflow semantics: missing evidence is reported as pending and cannot be represented as certification.
- Secret-material scanning of certification evidence.
- Reuse of Phase 69 repository/readiness prerequisites rather than duplicating their logic.
- CI execution of the certification contract plus the normal repository gates.

## Security and release boundaries

1. A green contract check is not itself a production certification; runtime, device and regional evidence must be supplied and reviewed.
2. Certification evidence must not contain credentials, private keys, tokens or other secret material.
3. Required evidence cannot be skipped, converted to warnings, or hidden behind success overrides.
4. Production certification does not change the authority boundary: Core/Control Plane remains authoritative for routing, policy, gateway and tunnel decisions.
5. Release artifacts must remain traceable to verified source commits and reproducible repository gates.

## Acceptance criteria

1. `ops/release/phase-70-certification.json` defines the v1.0 evidence and release contract.
2. `pnpm phase70:certify` validates the manifest, prerequisite paths, runtime versions, workflow safety and evidence safety.
3. Core/API/gateway/web and every supported client platform are explicitly represented in the certification contract.
4. Phase 69 readiness and repository gates are treated as prerequisites rather than silently assumed.
5. Runtime, device and regional evidence is explicitly pending until independently supplied; the verifier never marks absent evidence as certified.
6. Certification evidence is checked for obvious secret material before release.
7. CI runs the Phase 70 contract and the repository validation/typecheck/lint/test/build gates.
8. Documentation and project state identify Phase 70 as the current certification track without claiming v1.0 certification prematurely.

## Verification gates

Phase 70 remains **in progress** until all required evidence is independently verified, including control-plane/gateway runtime, regional evidence, upgrade/rollback rehearsal, backup/restore, chaos/soak, accessibility/localization, platform runtime, signed iOS/Android device smoke tests, artifact integrity and release-engineering sign-off.

A failed or missing evidence item is a release blocker. No production certification may be inferred from source presence alone.
