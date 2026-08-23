# Engineering Governance

This document defines the engineering controls required to scale InternetResiliencePlatform from the current implementation state through Phase 70 without architectural drift.

## Canonical sources

1. `ROADMAP.md` — concise product roadmap.
2. `docs/PRODUCT_ROADMAP_70_PHASES.md` — 0–70 execution contract.
3. `docs/PRODUCT_ARCHITECTURE.md` — architectural boundaries.
4. `PROJECT_STATE.md` — implementation truth.
5. `docs/phases/README.md` — evidence-backed phase records.

No secondary document may redefine product scope or contradict these sources.

## Architecture invariants

- Core domain logic remains independent of UI frameworks.
- Control Plane coordinates devices, policy, configuration and telemetry; it does not duplicate Core decision logic.
- Desktop and mobile clients are Full Clients over shared contracts.
- Platform-specific networking is isolated behind explicit adapters.
- Gateway and tunnel providers are provider-neutral and capability-driven.
- Routing, failover and policy changes must pass safety, verification and rollback gates.
- Analytics provides evidence and decision support; it must not silently mutate network state.
- Public APIs require versioned contracts and compatibility tests before breaking changes.

## Phase dependency discipline

Every new phase must declare:

- prerequisites;
- affected packages/apps;
- API/schema changes;
- migration/rollback strategy;
- security implications;
- tests and runtime evidence;
- documentation updates.

A phase cannot be marked complete because source files exist. Completion requires implementation, tests, repository validation, CI, documentation and any required platform/runtime/security evidence.

## Change classes

### Low risk
Documentation, tests, non-behavioral refactors and internal tooling.

### Contract change
Public API, event, schema, plugin SDK, configuration or persistence changes. Requires compatibility review and migration notes.

### Network-control change
DNS, routing, tunnel, gateway, failover or policy behavior. Requires explicit safety/rollback tests and runtime evidence.

### Security-critical change
Authentication, authorization, cryptography, secrets, supply chain, sandboxing or privileged OS integration. Requires security review and CI security gates.

## Scaling rule

New packages are not created merely to isolate a feature. A package must have a stable domain boundary, owner, test strategy and dependency rationale. Cross-package imports must follow the dependency graph rather than convenience imports.

## Documentation rule

Do not create one-off architecture documents for individual phases when an existing canonical contract can be updated. Historical phase records are evidence, not alternate specifications.
