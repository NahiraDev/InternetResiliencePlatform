# Phase 69 Release Checklist

Use this checklist for every release candidate. Do not mark an item complete from source inspection alone; attach CI/runtime evidence.

## 1. Performance

- [ ] Repository build completes within the CI budget.
- [ ] Startup/readiness is bounded and uses the real health contract.
- [ ] No new unbounded worker, retry or queue behavior is introduced.
- [ ] Memory/CPU regressions are reviewed for Core/API and clients.

## 2. Accessibility and localization

- [ ] Interactive UI has keyboard/focus support where applicable.
- [ ] Controls and status indicators have semantic labels/accessibility identifiers.
- [ ] Text remains usable under supported dynamic text/font scaling.
- [ ] Reduced-motion preferences are respected where applicable.
- [ ] User-visible strings are localizable.
- [ ] Protocol, storage and telemetry values are locale-neutral.

## 3. Upgrade and rollback

- [ ] Release artifact has an immutable version identifier.
- [ ] Database/schema compatibility is documented for the target and previous supported release.
- [ ] Upgrade rehearsal completed from the previous supported release.
- [ ] Rollback rehearsal completed using a compatible previous artifact or verified backup.
- [ ] No destructive downgrade migration is introduced.

## 4. Security audit

- [ ] CodeQL/security analysis is green.
- [ ] Dependency review is green.
- [ ] No secrets, private keys or access tokens are committed or emitted into telemetry.
- [ ] Privileged platform permissions are minimized and documented.
- [ ] CI has no false-green paths (`continue-on-error`, success overrides or skipped required tests).
- [ ] Release artifacts contain only intended files.

## 5. Compatibility

- [ ] Linux build/runtime evidence attached.
- [ ] macOS build/runtime evidence attached.
- [ ] Windows build/runtime evidence attached.
- [ ] iOS build + simulator/device evidence attached where available.
- [ ] Android build + emulator/device evidence attached where available.
- [ ] Core/API and gateway runtime evidence attached.

## 6. Chaos and soak

- [ ] Dependency startup failure exercised.
- [ ] Transient dependency loss exercised.
- [ ] Repeated failover/recovery exercised within configured budgets.
- [ ] Cancellation and cleanup exercised.
- [ ] Test environment is isolated; host networking is not mutated.
- [ ] Diagnostics are retained for failures.

## 7. Backup and restore

- [ ] Backup format/version is recorded.
- [ ] Backup created from a representative control-plane state.
- [ ] Restore succeeds into a clean destination.
- [ ] Restored state matches the source state.
- [ ] Corrupt/incompatible backup is rejected without partial application.

## 8. Release engineering

- [ ] `pnpm validate` green.
- [ ] `pnpm typecheck` green.
- [ ] `pnpm lint` green.
- [ ] `pnpm test` green.
- [ ] `pnpm build` green.
- [ ] `pnpm phase69:readiness` green.
- [ ] Required platform/runtime workflows green.
- [ ] Final release notes identify known limitations and evidence gaps.

## Evidence rule

A checked box must have a reproducible command, CI run, artifact, or runtime observation behind it. If evidence is unavailable, leave the item unchecked and record the reason.
