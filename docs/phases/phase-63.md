# Phase 63 — Windows Full Client

## Goal

Establish the Windows Full Client boundary without duplicating IRP Core decision logic. Platform-specific networking remains behind a Windows adapter and is safe to import/test on non-Windows CI hosts.

## Scope

- Windows network interface diagnostics via `ipconfig /all`.
- Route-table diagnostics via `route print`.
- DNS diagnostics via `netsh interface ip show dns`.
- Explicit platform capability reporting.
- Autonomous-mode policy state contract.
- Strict TypeScript and unit-test baseline.
- Follow-up work: Windows Service lifecycle, native networking hooks, secure control-plane integration and end-to-end runtime evidence.

## Security boundaries

The foundation does not execute privileged route mutation or firewall changes. Commands are fixed executable names with fixed argument vectors; no shell interpolation is used. Autonomous policy is state-only until the Core-controlled, authorized mutation layer is integrated.

## Acceptance criteria

1. `@irp/windows-client` builds and typechecks with strict compiler settings.
2. Non-Windows hosts never execute Windows commands.
3. Windows diagnostics return interfaces, routes and DNS evidence.
4. Policy state is isolated from callers.
5. No routing/policy intelligence is duplicated in the client.
6. CI executes unit/typecheck/lint/build checks and a real Windows runner job before Phase 63 is marked complete.

## Definition of done

Phase 63 is **in progress** until native Windows CI and runtime evidence are green. Source implementation alone does not mark the phase complete.

## Status

**In progress.** The platform boundary is implemented, but completion remains blocked until native Windows CI and runtime evidence demonstrate the diagnostics and integration contract on an actual Windows host.

## Verification

Repository verification covers validation, typecheck, lint, tests, and build. Phase closure additionally requires successful execution of the Windows-specific CI job and captured runtime evidence from the native platform boundary.
