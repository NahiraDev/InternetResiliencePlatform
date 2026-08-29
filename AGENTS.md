# InternetResiliencePlatform Agent Quick Start

1. Read `PROJECT_STATE.md`.
2. Identify the active phase and its verification status.
3. Read the phase document and relevant architecture contracts.
4. Read `.github/AGENT_PROTOCOL.md`.
5. If touching CI/runtime, read `.github/CI_CONTRACT.md`.
6. Declare a bounded scope before editing.
7. Implement, test, typecheck, lint and build as applicable.
8. Record evidence and hand off; never infer completion from source presence alone.

Preferred agent routing:

| Task | Agent |
|---|---|
| Feature/phase implementation | `irp-phase-implementer` |
| GitHub Actions / Runtime Lab / Public Runtime Lab | `irp-ci-runtime-engineer` |
| Architecture/domain review | `irp-architecture-reviewer` |
| Tests/flakiness/runtime verification | `irp-test-verification-engineer` |
| Integration/final gate/release readiness | `irp-integration-release-engineer` |

Parallel execution is allowed only when file/package ownership is disjoint. Contract changes always require integration review.
