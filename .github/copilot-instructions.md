# InternetResiliencePlatform — Agent Instructions

This repository is a large TypeScript/pnpm monorepo. Treat `PROJECT_STATE.md` as the canonical current-state handoff and `ROADMAP.md` as the immutable roadmap baseline.

Before modifying code, read:

- `PROJECT_STATE.md`
- `ROADMAP.md`
- active `docs/phases/phase-*.md`
- relevant `docs/architecture/*`
- `.github/AGENT_PROTOCOL.md`
- `.github/CI_CONTRACT.md` for workflow/runtime work

Use pnpm, not npm. Preserve the monorepo's package boundaries and existing scripts.

Canonical domain ownership currently includes:

- `@irp/gateway-registry`: gateway inventory/discovery/health, selection, multi-gateway failover and fleet operations.
- `@irp/tunnel`: tunnel contracts, lifecycle and concrete providers.
- resilience runtime: closed-loop observe/measure/detect/diagnose/decide/policy/apply/verify/recover behavior.
- UI/control-plane layers must not own safety-critical networking decisions.

Never introduce a competing abstraction when a canonical owner already exists.

Verification is mandatory. Do not weaken tests or CI to obtain green status. For networking/process/container changes, runtime evidence is part of completion. For CI changes, inspect workflow triggers, dependencies, concurrency, readiness, stability and cleanup—not just the failing job.

If working in parallel with other agents, keep the scope narrow and document handoff state. Conversation history is not a required project dependency.
