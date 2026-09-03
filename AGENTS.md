# InternetResiliencePlatform Agent Quick Start

1. Read `PROJECT_STATE.md`.
2. Read `.github/ACTIVE_WORK.md` for the current implementation gate and coordination state.
3. Identify the active phase and its verification status.
4. Read the phase document and relevant architecture contracts.
5. Read `docs/roadmap/MASTER_ROADMAP_V2.md` for current post-70 planning; `ROADMAP.md` and `docs/architecture/product-roadmap-70-phases.md` are historical/v1 planning references.
6. Read `.github/AGENT_PROTOCOL.md`.
7. If touching CI/runtime, read `.github/CI_CONTRACT.md`.
8. Declare a bounded scope before editing.
9. Implement, test, typecheck, lint and build as applicable.
10. Record evidence and hand off; never infer completion from source presence alone.

Preferred agent routing:

| Task | Agent |
|---|---|
| Feature/phase implementation | `irp-phase-implementer` |
| GitHub Actions / Runtime Lab / Public Runtime Lab | `irp-ci-runtime-engineer` |
| Architecture/domain review | `irp-architecture-reviewer` |
| Tests/flakiness/runtime verification | `irp-test-verification-engineer` |
| Integration/final gate/release readiness | `irp-integration-release-engineer` |

Parallel execution is allowed only when file/package ownership is disjoint. Contract changes always require integration review.

For Phase 72–150 work, do not create duplicate decision engines, global state registries, policy engines, event buses, provider registries or control-plane runtimes. Extend the existing canonical owner after inspecting the baseline audit and relevant architecture contracts.
