# InternetResiliencePlatform Agent Quick Start

## 0. Mandatory architecture contract

**Before planning, coding, reviewing, or changing architecture, read:**
`docs/architecture/IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md`

That document is the single canonical architecture contract for IRP. It defines the product identity, planes, canonical runtime authority, resource/fabric model, control loop, security boundaries, ownership rules, prohibited architecture drift, and definition of done.

Agents MUST extend that architecture rather than invent a competing control plane, decision engine, state model, roadmap, or product identity.

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

| Task | Agent |
| --- | --- |
| Feature/phase implementation | `irp-phase-implementer` |
| GitHub Actions / Runtime Lab / Public Runtime Lab | `irp-ci-runtime-engineer` |
| Architecture/domain review | `irp-architecture-reviewer` |
| Tests/flakiness/runtime verification | `irp-test-verification-engineer` |
| Integration/final gate/release readiness | `irp-integration-release-engineer` |

Parallel execution is allowed only when file/package ownership is disjoint. Contract changes always require integration review.

For Phase 72–150 work, extend the existing canonical owners after inspecting the reference architecture and current runtime evidence. Do not design a second architecture because an existing integration is incomplete.
