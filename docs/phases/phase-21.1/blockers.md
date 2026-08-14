# Phase 21.1 Blockers

## P211-BLOCK-001

- **Severity:** P1
- **Subsystem:** Electron Desktop
- **Problem:** Electron cannot start in the verification container because the native GTK dependency `libatk-1.0.so.0` is missing.
- **Evidence:** `pnpm --dir apps/desktop dev` builds TypeScript/assets, then Electron exits with `error while loading shared libraries: libatk-1.0.so.0`.
- **Why it blocks progression:** Main process startup, preload execution, renderer loading, IPC runtime behavior, UI page data flow, and runtime security checks cannot be truthfully verified.
- **Recommended remediation:** Add documented Linux runtime prerequisites/CI image dependencies or provide an Electron smoke-test environment with required GTK/X11 libraries, then rerun page/security/IPC verification.

## P211-BLOCK-002

- **Severity:** P1
- **Subsystem:** Cross-subsystem integration
- **Problem:** DNS, routing, tunnel, secure DNS, and AI decision packages remain primarily library-level/demo-level and are not wired as a live backend-to-desktop runtime chain.
- **Evidence:** Phase 21 audit import/call-graph finding remains valid; backend runtime health works, but `/api/v1/health/network` starts with no measurements and Electron is demo-data based.
- **Why it blocks progression:** The requested Backend → Core → Connectivity → Routing → DNS → Security → Recovery → AI → Event Bus → Electron → UI E2E path cannot pass as a real integrated system.
- **Recommended remediation:** Design and implement a stabilization-only integration harness/service layer that invokes existing implementations safely, with explicit dry-run boundaries for host networking.

## P211-BLOCK-003

- **Severity:** P1
- **Subsystem:** Secure DNS
- **Problem:** No live secure DNS provider was verified.
- **Evidence:** Only ordinary DNS/local lookup paths were safely executed; no DoH/DoT provider initialization, resolution, timeout, or recovery was found as a live backend/desktop path.
- **Why it blocks progression:** Secure DNS cannot be marked runtime functional.
- **Recommended remediation:** Either wire the existing secure DNS implementation if present, or document it as not implemented and defer product capability work to a later approved phase.
