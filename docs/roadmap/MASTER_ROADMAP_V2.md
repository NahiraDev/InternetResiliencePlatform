# IRP Master Roadmap V2 — Internet Control Plane

> Status: Architecture planning baseline
> Scope: Phases 72–150
> Purpose: Define the remaining architecture needed to evolve IRP from a resilient connectivity platform into a unified, policy-driven, autonomous Internet Control Plane.

## Governance

This roadmap is the coordination contract for parallel contributors and AI agents. Before implementing a phase, contributors MUST check this document, `MASTER_ROADMAP.md`, `PROJECT_STATE.md`, active phase documents, and open PRs. A phase MUST NOT be implemented twice. Shared contracts and dependency boundaries MUST be preserved.

The target architecture follows an intent-based closed loop: ingest/normalize intent, translate and orchestrate it, observe operational state, assess compliance, act safely, verify outcomes, and continuously correct drift. This is aligned conceptually with IRTF RFC 9315.

## Phase Groups

### Group A — Unified Control Plane (72–78)
- **Phase 72 — Control-Plane Architecture Completion**: canonical control-plane boundaries and ownership.
- **Phase 73 — Unified Network State Model**: canonical desired/observed/actual network state.
- **Phase 74 — Control-Plane Contracts**: typed interfaces/events across intelligence, policy, execution, and assurance.
- **Phase 75 — Decision Orchestration**: deterministic composition of measurements, policies, capabilities, and constraints.
- **Phase 76 — Action Transaction Engine**: transactional, ordered, idempotent, observable network changes.
- **Phase 77 — Safety, Rollback & Recovery Kernel**: preconditions, blast-radius limits, checkpoints, rollback, recovery.
- **Phase 78 — Closed-Loop Control Foundation**: bounded observe → decide → apply → verify loop.

### Group B — Intent & Policy (79–85)
- **Phase 79 — Intent Model & Lifecycle**
- **Phase 80 — Intent API & Ingestion**
- **Phase 81 — Intent Translation / Compilation**
- **Phase 82 — Policy Decision & Enforcement Engine**
- **Phase 83 — Policy Conflict Resolution**
- **Phase 84 — Safety Constraints & Change Governance**
- **Phase 85 — Intent Assurance & Drift Management**

### Group C — Connectivity Fabric (86–92)
- **Phase 86 — Unified Connectivity Fabric**
- **Phase 87 — Multi-Interface Intelligence**
- **Phase 88 — Multi-Path Connectivity Management**
- **Phase 89 — Gateway Intelligence & Selection**
- **Phase 90 — DNS / Tunnel / Proxy Orchestration Integration**
- **Phase 91 — Application-Aware Path Selection**
- **Phase 92 — Connectivity Service Assurance**

### Group D — Advanced Routing & Recovery (93–99)
- **Phase 93 — Advanced Routing Control**
- **Phase 94 — Traffic Classification**
- **Phase 95 — Policy-Based Routing**
- **Phase 96 — Dynamic Route Optimization**
- **Phase 97 — Service Reachability Intelligence**
- **Phase 98 — Congestion & Degradation Awareness**
- **Phase 99 — Predictive Failover & Recovery**

### Group E — Telemetry & Network Intelligence (100–106)
- **Phase 100 — Unified Telemetry Plane**
- **Phase 101 — Streaming Metrics & Events**
- **Phase 102 — Cross-Layer Event Correlation**
- **Phase 103 — Topology & Dependency Intelligence**
- **Phase 104 — Historical Network State & Time-Series Intelligence**
- **Phase 105 — Anomaly Detection**
- **Phase 106 — Telemetry-Driven Closed-Loop Assurance**

### Group F — Security & Trust (107–113)
- **Phase 107 — Secure Control-Plane Architecture**
- **Phase 108 — Device Identity & Enrollment Trust**
- **Phase 109 — Authorization / Capability Model**
- **Phase 110 — Secrets & Key Lifecycle**
- **Phase 111 — Secure Agent ↔ Control Plane Protocol**
- **Phase 112 — Security Policy & Runtime Enforcement**
- **Phase 113 — Security Monitoring & Automated Response**

### Group G — Fleet & Distributed Control (114–120)
- **Phase 114 — Fleet Management Foundation**
- **Phase 115 — Device Enrollment & Lifecycle**
- **Phase 116 — Remote Configuration & Policy Distribution**
- **Phase 117 — Distributed Control & Coordination**
- **Phase 118 — Multi-Device Orchestration**
- **Phase 119 — Tenant / Organization Isolation**
- **Phase 120 — Fleet Health & Observability**

### Group H — Intelligence, Simulation & Production (121–127)
- **Phase 121 — Network Knowledge Base**
- **Phase 122 — Network State Prediction**
- **Phase 123 — Decision Intelligence & AI Assistance**
- **Phase 124 — Autonomous Optimization**
- **Phase 125 — Network Simulation / Digital Twin**
- **Phase 126 — Chaos, Resilience & Hardware-in-the-Loop Validation**
- **Phase 127 — Final Production Certification & Release Readiness**

### Group I — Data Plane & Traffic Engineering (128–134)
- **Phase 128 — Data-Plane Abstraction & Enforcement**
- **Phase 129 — Flow / Connection Lifecycle Intelligence**
- **Phase 130 — QoS, Priority & Traffic Engineering**
- **Phase 131 — Service/Application Policy Enforcement**
- **Phase 132 — Network Address / Session Management**
- **Phase 133 — Advanced NAT / Firewall Policy Integration**
- **Phase 134 — Data-Plane Assurance & Safe Reconciliation**

### Group J — Platform APIs & Extensibility (135–140)
- **Phase 135 — Versioned Control-Plane API**
- **Phase 136 — Event Bus & Integration Contracts**
- **Phase 137 — Plugin / Provider Lifecycle Governance**
- **Phase 138 — Capability Discovery & Provider Registry**
- **Phase 139 — External Integrations / Webhooks / SDK Contracts**
- **Phase 140 — API Compatibility, Migration & Deprecation Framework**

### Group K — Privacy, Governance & Compliance (141–145)
- **Phase 141 — Privacy-Preserving Telemetry**
- **Phase 142 — Data Classification, Retention & Deletion**
- **Phase 143 — Auditability & Immutable Control History**
- **Phase 144 — Privacy / Security Governance Controls**
- **Phase 145 — Compliance & Operational Evidence Framework**

### Group L — Reliability, Scale & Disaster Recovery (146–150)
- **Phase 146 — Control-Plane High Availability**
- **Phase 147 — Distributed State Consistency & Conflict Recovery**
- **Phase 148 — Horizontal Scale & Backpressure Engineering**
- **Phase 149 — Backup, Disaster Recovery & Regional Recovery**
- **Phase 150 — Global Platform Readiness & Final Architecture Certification**

## Dependency Rules

1. Groups are ordered dependencies, not independent feature lists.
2. Control-plane state and contracts precede autonomous behavior.
3. Intent and policy precede AI-driven decisioning.
4. Safety and rollback are mandatory before broad autonomous execution.
5. Telemetry and assurance are first-class dependencies of autonomy.
6. Fleet control must reuse the same device/control contracts rather than fork them.
7. AI may advise or optimize only through policy, safety, authorization, and execution boundaries.
8. Data-plane enforcement must remain behind explicit policy and safety controls.
9. Privacy, auditability, and security are architectural requirements, not release-only cleanup.
10. HA and distributed-state work must preserve deterministic local fallback when the control plane is unavailable.
11. No phase may weaken existing security, privacy, deterministic fallback, or recovery guarantees.

## Parallel-Work Rules

- One owner/agent per phase at a time.
- Each implementation gets a dedicated branch named `phase/<number>-<short-name>` unless an existing project convention explicitly requires another name.
- Every phase must have a corresponding `docs/phases/phase-<number>.md` before implementation is considered complete.
- Phase documents must state scope, non-goals, dependencies, affected packages, contracts, tests, acceptance criteria, and rollback considerations.
- Do not modify another active phase's contract without coordinating through a dedicated integration change.
- Do not introduce duplicate engines, registries, state models, policy systems, or provider abstractions when an existing canonical component can be extended.
- CI must remain green before merge.
- Historical phase documents remain immutable except for factual corrections; current architecture belongs in this roadmap and current state documents.
- Before claiming a phase complete, verify the implementation against the phase document and current repository state; a roadmap entry alone is not implementation evidence.

## Completion Definition

IRP should be considered architecturally complete only when it can safely express desired network outcomes, derive and execute a plan across supported connectivity and data-plane primitives, continuously observe and assure the resulting state, detect and correct drift, recover from failed changes, enforce security/privacy/authorization boundaries, expose stable integration contracts, and coordinate these capabilities across managed devices at production scale without requiring low-level manual intervention.

This roadmap does not claim that every phase is implemented. It is the target completion architecture against which implementation status must be audited.
