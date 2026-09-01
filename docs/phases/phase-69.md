# Phase 69 — Cross-Platform Production Hardening

## Status

**Implementation in progress; verification required.**

Phase 69 hardens the existing product without moving safety-critical routing, gateway, tunnel or policy authority into platform clients. It adds a single production-readiness contract for release engineering, compatibility evidence, upgrade/rollback safety, accessibility/localization expectations, bounded failure-injection, and backup/restore verification.

## Scope

- Performance and resource-budget checks for release candidates.
- Accessibility and localization acceptance rules for user-facing clients.
- Explicit upgrade/rollback procedure and compatibility policy.
- Security-audit checklist covering credentials, permissions, supply chain and CI behavior.
- Cross-platform compatibility matrix covering Linux, macOS, Windows, iOS and Android.
- Bounded chaos/soak verification that exercises failure and recovery without mutating a developer host network.
- Deterministic backup/restore verification for control-plane state.
- Release manifest and machine-readable readiness gate.
- CI integration with deterministic failure propagation.

## Architectural constraints

1. Core/Control Plane remains authoritative for routing, destination policy, gateway selection, tunnel selection and failover.
2. Platform clients remain adapters and presentation surfaces; this phase does not duplicate routing intelligence.
3. Production checks must be bounded, observable, reversible and auditable.
4. No readiness check may silently skip a required test or convert failure into success.
5. Runtime/network chaos tests must use isolated fixtures or simulations unless an explicitly provisioned test environment is supplied.

## Acceptance criteria

### Performance

- Release candidates declare measurable startup, readiness and resource budgets.
- CI can execute bounded readiness checks without relying on an unbounded sleep.

### Accessibility and localization

- User-facing clients have documented keyboard/focus, semantic-label, contrast, dynamic-text and reduced-motion expectations where the platform supports them.
- User-visible strings are identified as localizable resources rather than being treated as immutable protocol data.
- Locale-sensitive formatting is prohibited in protocol/storage values.

### Upgrade and rollback

- A release records its schema/application compatibility expectations.
- Upgrade is forward-only within a supported compatibility window.
- Rollback is defined as restoring the previous application artifact against a compatible state or restoring a verified backup; destructive downgrade migrations are prohibited by policy.

### Security audit

- CI, dependency, credential, permission and release-artifact controls are explicitly reviewed.
- Android/iOS privileged networking remains behind platform permission boundaries.
- Secrets and private credentials are excluded from telemetry and release artifacts.

### Compatibility

- Linux, macOS, Windows, iOS and Android each have an explicit support row with build/CI and runtime evidence fields.
- Unsupported combinations are recorded rather than implied to work.

### Chaos/soak

- Failure injection covers startup failure, transient dependency loss, repeated recovery and cancellation/cleanup.
- The harness is bounded and deterministic and must demonstrate recovery without changing the host's real network configuration.

### Backup/restore

- Backup format is versioned.
- Restore is tested against a clean destination.
- Corrupt/incompatible backups are rejected without partially applying state.

### Release engineering

- `phase69:readiness` validates the production-hardening contract.
- CI runs the gate on relevant production, client, runtime, security and documentation changes.
- Phase 69 remains open until repository validation and the applicable runtime/security evidence are green.

## Verification commands

```text
pnpm validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm phase69:readiness
```

## Evidence record

The machine-readable contract lives at `ops/release/phase-69-readiness.json`. The cross-platform matrix lives at `docs/release/phase-69-compatibility-matrix.md`.

Runtime/device-specific evidence must be recorded by CI or an explicitly provisioned test environment; source presence alone does not close this phase.
