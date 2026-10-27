# InternetResiliencePlatform Agent Quick Start

## 0. Mandatory architecture contract

**Before planning, coding, reviewing, or changing architecture, read:**
`docs/architecture/IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md`

It is the canonical contract for product identity, planes, runtime authority, control loop, security, ownership, prohibited drift, and done criteria. Extend it; never invent a competing control plane, decision engine, state model, roadmap, or product identity.

1. Read `PROJECT_STATE.md`.
2. Read `.github/ACTIVE_WORK.md` for the current implementation gate and coordination state.
3. Read the **Superplatform Reference Architecture** above before making architectural decisions.
4. Identify the active phase and its verification status.
5. Read the phase document and relevant architecture contracts.
6. Read `docs/roadmap/MASTER_ROADMAP_V2.md` for current post-70 planning; `ROADMAP.md` and `docs/architecture/product-roadmap-70-phases.md` are historical/v1 planning references.
7. Read `.github/AGENT_PROTOCOL.md`.
8. If touching CI/runtime, read `.github/CI_CONTRACT.md`.
9. Declare a bounded scope before editing.
10. Implement, test, typecheck, lint and build as applicable.
11. Record evidence and hand off; never infer completion from source presence alone.

## Architectural invariants

- `@irp/resilience-runtime` is the canonical production orchestration authority.
- Hosts use the canonical runtime composition boundary.
- API, CLI, Desktop, Mobile and plugins are not alternate privileged control planes.
- Legacy `NetworkAutopilot` must not regain production authority.
- AI is advisory and cannot bypass policy/security/safety.
- Important mutations require transactional execution and outcome verification.
- Failed mutations require rollback/recovery semantics.
- Remote/federated evidence cannot silently become unrestricted authority.
- Local autonomy must survive optional remote/database/AI/telemetry outages where the reference architecture requires it.
- Do not create duplicate decision engines, global state registries, policy engines, event buses, provider registries, planners, transaction executors or control-plane runtimes.
- Do not create artificial future phases as a substitute for fixing current integration gaps.
- Never weaken tests, hide failures, skip gates, or manufacture green CI.

## Preferred agent routing

Use `irp-phase-implementer` for phase work, `irp-ci-runtime-engineer` for CI/runtime labs, `irp-architecture-reviewer` for architecture, `irp-test-verification-engineer` for verification, and `irp-integration-release-engineer` for release gates. For Phases 72–150, extend the canonical owner; never make a second architecture to cover an incomplete integration.

## Architecture enforcement gate

The reference architecture is a repository contract enforced by the architecture check and repository validation.

When implementing any issue or feature:

- Do not redesign IRP or introduce a competing product architecture.
- Find and extend the canonical owner before adding an abstraction.
- A new authority is prohibited unless the architecture contract is explicitly changed and the validator is changed in the same reviewed change.
- Treat architecture-check failures as blocking failures; never weaken, skip, or bypass them.
- Do not change the architecture contract merely to make an implementation pass. First prove the implementation is consistent with the existing contract.
- If a capability appears to require a new authority, reconcile ownership against the reference architecture and machine-readable contract before coding.
- Any intentional architecture evolution must update the canonical architecture document, machine-readable contract, validator, tests, and CI gate together.
<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

- Functions are stateless and ephemeral: use Blob or Marketplace services for durable state; prefer Node Vercel Functions over deprecated Edge Functions. Do not start projects on discontinued Vercel KV/Postgres.
- Keep secrets in Vercel Env Variables (never Git or `NEXT_PUBLIC_*`); add integrations with `vercel integration add`, and use `vercel pull`/`vercel env pull` for local parity.
- Use `waitUntil` for post-response work, place functions near data, and tune Fluid Compute for long I/O. Runtime Cache is regional only; use Cron (UTC GET) for schedules, Blob for media, and Edge Config for small global reads.
- Keep Deployment Protection enabled; retry protected URLs with `vercel curl`. Use `@vercel/otel`, Web Analytics, and Speed Insights on Node functions.
- For AI Gateway, set `AI_GATEWAY_API_KEY` and verify available models with `curl https://ai-gateway.vercel.sh/v1/models`. Use Workflow plus Sandbox for durable loops or untrusted code; use Vercel MCP for infrastructure access.
<!-- VERCEL BEST PRACTICES END -->
