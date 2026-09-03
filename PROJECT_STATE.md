# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current gate:** Phase 71 — Cross-Platform Distribution & GitHub Releases.
- **Phase 71 status:** implementation is complete on `main`; external release evidence is still required before certification. The phase record requires a real tagged GitHub Release, published assets and checksum/release inspection. Do not represent Phase 71 as certified from source presence or CI alone.
- **Current main baseline reviewed:** `08bbea196b6d23fd7f661cae5315834b7ff22e9f` (`fix(release): correct Android artifact upload path for Phase 71`).
- **Release state:** the repository currently has no published GitHub Releases, so the Phase 71 external certification gate remains open.
- **Recent release-pipeline fix:** the Android artifact upload path was corrected to use the workspace-rooted artifact produced by the Android job's `working-directory` override.
- **Post-70 roadmap:** `docs/roadmap/MASTER_ROADMAP_V2.md` is the current planning authority for Phases 72–150.
- **Historical/v1 roadmap:** `ROADMAP.md` and `docs/architecture/product-roadmap-70-phases.md` preserve the 0–70 product baseline and should not be interpreted as the current post-v1 roadmap.
- **Phase 72 status:** architecture-preparation baseline exists, but Phase 72 must not be treated as completed while the Phase 71 external certification gate remains open.

## Phase 71 certification prerequisites

The Phase 71 gate is limited to the release/distribution contract defined by `docs/phases/phase-71.md`. The remaining evidence is:

- repository release-gate validation (validate, typecheck, lint, tests and build evidence applicable to the release commit);
- successful execution of the release workflow from a real semantic version tag;
- exactly one Android debug APK, Linux bundle, macOS bundle, Windows bundle and iOS source/developer ZIP attached to the GitHub Release;
- no unsigned iOS `.ipa` output;
- generated `SHA256SUMS.txt` published with the release and verified before publication;
- inspection of every published asset for naming, non-empty content, platform identity and checksum coverage;
- verification that the human-facing download documentation matches the published artifact set.

Device/runtime smoke tests or signed iOS distribution belong to the applicable downstream platform/runtime phases and are not silently substituted for Phase 71's release-contract evidence. In particular, Phase 71 intentionally publishes an iOS source/developer bundle rather than a signed installable `.ipa`.

## Current architecture authority

IRP is a headless Core + unified Control Plane with full-capability clients. The canonical network-control loop is:

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn → Explain
```

The immediate architectural objective is not to create a second control plane. The repository already contains substantial control-plane/runtime primitives. Phase 72–78 must consolidate and formalize their ownership before adding broader autonomy.

### Existing ownership boundaries

- `@irp/resilience-runtime` is the primary transport-agnostic runtime/control-loop authority.
- `@irp/network-intelligence` supplies measurements, models and decision intelligence; it must not become a second independent mutation authority.
- `@irp/gateway-registry` owns gateway inventory/discovery/health/selection/failover/fleet behavior.
- `@irp/tunnel` owns tunnel contracts, lifecycle and concrete tunnel providers.
- DNS, connectivity, routing, security, telemetry and plugin packages retain their domain-specific contracts behind the shared control-plane boundary.
- `apps/api`, SDKs and clients expose/consume capabilities; UI/client layers do not own safety-critical routing or policy decisions.

These are architecture directions to be verified and refined by Phase 72; they are not a claim that every cross-package boundary is already fully normalized.

## Phase 72–150 execution governance

The current post-v1 roadmap is grouped as:

- 72–78 — Unified Control Plane
- 79–85 — Intent & Policy
- 86–92 — Connectivity Fabric
- 93–99 — Advanced Routing & Recovery
- 100–106 — Telemetry & Network Intelligence
- 107–113 — Security & Trust
- 114–120 — Fleet & Distributed Control
- 121–127 — Intelligence, Simulation & Production
- 128–134 — Data Plane & Traffic Engineering
- 135–140 — Platform APIs & Extensibility
- 141–145 — Privacy, Governance & Compliance
- 146–150 — Reliability, Scale & Disaster Recovery

Dependency rules:

1. Control-plane state/contracts precede broad autonomy.
2. Intent/policy precede AI-assisted autonomous control.
3. Safety, authorization, rollback and recovery precede broad execution authority.
4. Telemetry and assurance are first-class autonomy dependencies.
5. Fleet control reuses device/control contracts instead of forking them.
6. Data-plane enforcement remains behind explicit policy and safety controls.
7. Privacy, security and auditability are architectural requirements, not release-only cleanup.
8. Distributed control must preserve deterministic local fallback when centralized control is unavailable.
9. No phase may weaken least-privilege, privacy, fallback, recovery or auditability guarantees.

## Parallel-agent rules

- One owner per active phase.
- One agent owns a file/package at a time.
- Use a dedicated branch `phase/<number>-<short-name>` for phase implementation.
- Shared contract changes require integration review before dependent implementations proceed.
- Do not create duplicate decision engines, state registries, policy engines, event buses, provider registries or control-plane runtimes when an existing canonical component can be extended.
- Every phase record must define scope, non-goals, dependencies, affected packages, contracts, tests, acceptance criteria and rollback considerations.
- Phase completion requires implementation plus the verification/evidence defined by its phase contract. Documentation or source presence alone is never completion evidence.

## Phase verification rules

For every phase:

1. inspect existing implementation before adding abstractions;
2. preserve compatible contracts unless a breaking change is explicitly justified;
3. test normal, boundary, invalid and failure paths as applicable;
4. run the required repository gates: `pnpm validate`, `pnpm typecheck`, `pnpm lint`, relevant tests and builds;
5. apply explicit security/abuse review to security-sensitive changes;
6. verify runtime behavior for networking, process, container and platform changes;
7. update canonical documentation and state;
8. require green CI before declaring the phase complete.

For networking automation, every mutation must be policy-checked, bounded, observable, reversible and auditable.

## Canonical evidence locations

- Current state: this file.
- Current post-70 roadmap: `docs/roadmap/MASTER_ROADMAP_V2.md`.
- Historical 0–70 roadmap: `ROADMAP.md` and `docs/architecture/product-roadmap-70-phases.md`.
- Current phase records: `docs/phases/`.
- Historical numbering reconstruction: `docs/audits/phase-history-evidence-matrix.md`.
- Control-plane execution baseline: `docs/audits/control-plane-execution-baseline-2026-09-03.md`.
- API contract: `docs/api/control-plane-contract.md`.
- Live runtime architecture: `docs/architecture/live-control-plane.md`.
- Engineering governance: `docs/architecture/engineering-governance.md`.
- Parallel-agent protocol: `docs/architecture/parallel-agent-protocol.md`, `.github/AGENT_PROTOCOL.md` and `.github/ACTIVE_WORK.md`.

## Known architectural findings entering Phase 72

The repository already contains observation, state, planning, policy, decision, execution, verification, telemetry and recovery primitives. The main risks entering the next roadmap segment are ownership fragmentation and contract duplication, especially around:

- decision orchestration versus decision intelligence;
- desired/observed/actual state semantics;
- event taxonomy and event ownership;
- cross-domain action/transaction semantics;
- unified safety and rollback boundaries.

The detailed evidence-backed analysis is in `docs/audits/control-plane-execution-baseline-2026-09-03.md`.

## Product objective

IRP's long-term objective is a safe, observable and policy-governed Internet control plane that can continuously measure network conditions, diagnose failures, select and apply bounded changes, verify outcomes, recover from failure and explain decisions across supported clients and network providers.
