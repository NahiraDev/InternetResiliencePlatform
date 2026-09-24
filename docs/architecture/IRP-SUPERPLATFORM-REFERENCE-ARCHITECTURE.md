# IRP Superplatform Reference Architecture
## Canonical Architecture Contract — Single Source of Truth

> **Status:** Canonical architectural contract
> **Applies to:** `main` and every future implementation agent
> **Current verified main baseline:** `07eb6427cc71064d22720b88d22d717699dafc9e` (merge of PR #296)
> **Product identity:** Autonomous Internet Superplatform / Network Operating System / Programmable Connectivity Fabric
>
> This document is the architectural north star. Future agents MUST extend this architecture rather than invent a competing architecture, control plane, roadmap, state model, or ownership model.

---

## 1. Non-negotiable product definition

IRP is **not** primarily a VPN, DNS switcher, failover utility, network monitor, dashboard, AI chatbot, or collection of networking packages.

IRP is a local-first autonomous network operating system that turns connectivity resources into a programmable fabric and continuously optimizes connectivity outcomes for users, applications, services, and workloads.

The user expresses an intent or simply uses an application. IRP should progressively handle:

```
Intent / Workload
  -> Understand
  -> Observe
  -> Measure
  -> Build Knowledge
  -> Detect
  -> Correlate
  -> Diagnose
  -> Predict
  -> Generate Strategies
  -> Optimize
  -> Decide
  -> Policy
  -> Security
  -> Safety
  -> Plan
  -> Reserve
  -> Execute
  -> Verify Outcome
  -> Commit
  -> Learn
  -> Update Knowledge
  -> Observe Again
```

Healthy operation is intentionally quiet and low overhead. Degraded operation increases observation, diagnosis, planning and verification depth. Recovery is bounded, reversible and evidence-driven.

---

## 2. Canonical system model

```
                           IRP SUPERPLATFORM
                                  |
        +-------------------------+-------------------------+
        |                         |                         |
   EXPERIENCE                 INTENT PLANE            GOVERNANCE
  CLI/Desktop/Mobile       User/App/Workload         Policy/Trust
        |                         |                    Security
        +-------------------------+-------------------------+
                                  |
                     AUTONOMOUS CONTROL PLANE
                                  |
        +------------+------------+------------+------------+
        |            |                         |            |
   KNOWLEDGE     INTELLIGENCE              PLANNING     ASSURANCE
    PLANE          PLANE                   & SCHEDULING
        |            |                         |            |
        +------------+-------------+-----------+------------+
                                   |
                      CONNECTIVITY FABRIC
                                   |
       +--------+--------+---------+---------+--------+--------+
       |        |        |         |         |        |        |
    Device  Interface  Link     Route    Gateway  Provider  DNS
       |        |        |         |         |        |        |
       +--------+--------+---------+---------+--------+--------+
                                   |
       +-------------+-------------+-------------+-------------+
       |             |             |             |             |
    Tunnel       Transport       Proxy         Egress      Remote Node
       |             |             |             |             |
       +-------------+-------------+-------------+-------------+
                                   |
                              DATA PLANE
                                   |
                  Applications / Services / Workloads
                                   |
                              DESTINATIONS
```

### The planes

**Experience plane**
- API, CLI, Desktop, Mobile and OS clients.
- Never becomes a second privileged control plane.

**Intent plane**
- Represents desired outcomes, constraints, priorities, scope, provenance, confidence, expiration and autonomy level.
- Compiles intent into executable objectives and constraints.

**Governance plane**
- Policy, authorization, trust, privacy, security, safety and autonomy admission.
- Governance is a gate, not a second executor.

**Knowledge plane**
- Current observations, measurements, topology, resource state, history, failure memory, remote evidence, predictions and provenance.

**Intelligence plane**
- Deterministic reasoning, correlation, historical intelligence, predictive analysis, optimization and advisory AI.
- AI remains advisory and cannot bypass governance or execution safety.

**Control plane**
- Canonical orchestration authority centered on `@irp/resilience-runtime`.
- Owns decision lifecycle, planning, transaction boundaries, verification, recovery and learning orchestration.

**Connectivity fabric**
- Programmable model of actual connectivity resources and paths.

**Data plane**
- Actual traffic/connectivity outcomes. Control-plane decisions must be verified against real outcomes rather than command return codes.

---

## 3. Canonical authority rule

### One production mutation authority

`@irp/resilience-runtime` is the canonical runtime composition/control authority.

Current main includes the canonical composition factory introduced by PR #296:

```
createCanonicalRuntime(...)
        |
        +--> daemon host
        +--> Linux client host
        +--> future supported hosts
```

Hosts inject platform/domain adapters into the same runtime composition. They must not independently instantiate competing orchestration stacks.

The following are domain owners behind the canonical runtime boundary:

- connectivity
- routing
- DNS
- gateway registry
- tunnels
- failover/recovery
- network intelligence
- security
- telemetry
- historical analysis
- federation
- plugins

Domain ownership does **not** mean independent privileged orchestration.

### Forbidden

Never introduce another production authority named or equivalent to:

- NetworkAutopilot runtime
- second DecisionEngine
- second PolicyEngine
- second SafetyKernel
- second global StateRegistry
- second ProviderRegistry
- second EventBus
- second Planner
- second transaction executor
- client-specific privileged orchestrator

Legacy `NetworkAutopilot` remains compatibility/replay material only and must not regain production authority.

---

## 4. Canonical control loop

### Normal path

```
OBSERVE
 -> MEASURE
 -> NORMALIZE
 -> UNDERSTAND
 -> DETECT
 -> CORRELATE
 -> DIAGNOSE
 -> PREDICT
 -> GENERATE CANDIDATES
 -> SCORE
 -> OPTIMIZE
 -> DECIDE
 -> POLICY
 -> SECURITY
 -> SAFETY
 -> PLAN
 -> RESERVE
 -> EXECUTE
 -> VERIFY
 -> COMMIT
 -> LEARN
 -> UPDATE KNOWLEDGE
 -> OBSERVE
```

### Failure path

```
VERIFY FAILS
 -> ROLLBACK
 -> VERIFY ROLLBACK
 -> RECOVER
 -> QUARANTINE FAILED STRATEGY
 -> SELECT NEXT SAFE STRATEGY
 -> VERIFY
 -> LEARN
 -> UPDATE KNOWLEDGE
 -> OBSERVE
```

Every autonomous mutation must be traceable from trigger/evidence to outcome.

---

## 5. Intent architecture

Intent is a first-class executable abstraction, not a DTO.

```
User / Application / Workload
        |
        v
NetworkIntent
        |
        v
Normalize
        |
        v
Compile
        |
        v
Resolve constraints
        |
        v
Resolve policy
        |
        v
Resolve conflicts
        |
        v
Build objectives
        |
        v
Discover resources
        |
        v
Generate strategies
```

Canonical intent metadata:

- target/scope
- objectives
- constraints
- priority
- specificity
- confidence
- provenance
- autonomy level
- expiration/TTL
- policy context
- security/trust requirements

Multi-intent arbitration belongs in governance. It must not create a second execution engine.

Admission outcomes are conceptually:

- ALLOW
- PLAN_ONLY
- REQUIRE_APPROVAL
- DENY

Risk/autonomy limits must be enforced before privileged execution.

---

## 6. Connectivity Fabric

The fabric is the platform's programmable connectivity resource model.

### Resource classes

```
Device
Interface
Link
Provider
Gateway
Route
Resolver
Tunnel
Transport
Proxy
Egress
RemoteNode
Region
Destination
Service
Endpoint
Application
Workload
Path
```

Every resource should have, where applicable:

- stable identity
- type
- capabilities
- lifecycle state
- health
- capacity
- freshness
- confidence
- trust
- ownership
- cost
- failure domains
- security boundary
- telemetry
- historical reliability
- policy constraints

### Canonical resource states

```
UNKNOWN
DISCOVERING
HEALTHY
DEGRADED
FAILED
BLOCKED
RESTRICTED
RECOVERING
QUARANTINED
DRAINING
UNAVAILABLE
```

Do not create incompatible duplicate state vocabularies.

---

## 7. Fabric graph / knowledge graph

The network graph must evolve toward a dynamic graph representing both topology and operational knowledge.

### Nodes

- device
- interface
- link
- route
- gateway
- provider
- resolver
- tunnel
- transport
- proxy
- egress
- remote node
- region
- destination
- service
- endpoint
- application
- workload

### Edges

- connected-to
- routes-through
- reachable-through
- resolves-through
- tunnels-through
- exits-through
- preferred-for
- degraded-for
- blocked-for
- trusted-by
- historically-successful-for
- depends-on
- correlated-with
- fails-with
- constrained-by

Edges carry freshness/confidence/provenance where the relationship is inferred.

---

## 8. Failure-domain model

The optimizer must understand shared dependencies.

Failure domains include:

- provider
- ASN
- gateway
- resolver
- Wi-Fi segment
- interface
- route
- tunnel provider
- transport
- remote region
- destination service

Two paths are not diverse merely because their final gateway identifiers differ if they share a provider/failure domain.

---

## 9. Intelligence hierarchy

```
Deterministic rules
      |
Measurements/statistics
      |
Correlation
      |
Historical intelligence
      |
Failure-domain reasoning
      |
Prediction
      |
Multi-objective optimization
      |
Federated evidence
      |
AI advisory reasoning
```

Evidence must distinguish:

- observation
- measurement
- inference
- hypothesis
- prediction
- decision
- outcome

Evidence should carry:

- source
- timestamp
- freshness
- confidence
- scope
- provenance
- type
- corroboration
- expiration

Conflicting evidence must be deterministically arbitrated. Fresh local measurements must not be treated identically to stale remote or speculative AI evidence.

---

## 10. AI boundary

AI can:

- summarize evidence
- generate hypotheses
- generate candidate strategies
- identify correlations
- assist prediction
- explain decisions

AI cannot directly:

- mutate routes
- change DNS
- enable/disable tunnels
- change gateways
- alter firewall/network state
- access secrets unnecessarily
- execute arbitrary shell commands
- bypass plugin permissions
- bypass policy/security/safety

Canonical boundary:

```
AI
 -> evidence / hypothesis / candidate
 -> canonical decision
 -> policy
 -> security
 -> safety kernel
 -> planner
 -> transactional executor
 -> verifier
```

---

## 11. Optimization model

There is no universal static "best path".

Optimization is contextual.

Objectives may include:

- reachability
- availability
- latency
- jitter
- packet loss
- throughput
- stability
- privacy
- trust
- security
- cost
- energy/resource usage
- path diversity
- failure-domain independence
- historical reliability
- recovery probability

Weights are derived from intent and policy.

A strategy must contain:

- expected outcome
- confidence
- required resources
- cost
- risk
- reversibility
- failure-domain exposure
- policy compatibility
- security impact
- verification criteria

---

## 12. Planner and scheduler

The planner converts selected strategy into an executable plan.

```
Plan
 |- objective
 |- preconditions
 |- resources
 |- capabilities
 |- constraints
 |- actions
 |- ordering
 |- parallelism
 |- safety boundaries
 |- timeout/deadline
 |- verification
 |- rollback
 `- recovery
```

The scheduler manages:

- resource contention
- reservation
- priorities
- deadlines
- capacity
- leases
- concurrency
- cancellation
- stale decisions

Plans must not race and overwrite newer network state.

---

## 13. Transaction model

Important mutations follow:

```
PREPARE
 -> SNAPSHOT
 -> VALIDATE
 -> POLICY
 -> SECURITY
 -> SAFETY
 -> APPLY
 -> VERIFY
 -> COMMIT
```

Failure:

```
ROLLBACK
 -> VERIFY ROLLBACK
 -> RECOVER
```

Required properties:

- idempotency
- generation/epoch/version checks
- leases
- TTL/deadlines
- cancellation
- concurrency protection
- compensation
- observable transaction identity

---

## 14. Outcome verification

Command success is not network success.

Verification must evaluate the requested outcome.

Examples:

- destination reachability
- service reachability
- latency
- jitter
- packet loss
- throughput
- expected egress
- expected transport
- privacy/trust constraints

Verification should be scoped to resource/path/destination/service/application/workload.

---

## 15. Adaptive control intensity

```
HEALTHY
  -> low overhead

UNCERTAIN
  -> moderate observation

DEGRADED
  -> deeper diagnosis

RECOVERY
  -> high-resolution control and verification

STABLE
  -> return to low overhead
```

The healthy state must not trigger unnecessary network mutations.

---

## 16. Predictive autonomy

When evidence is sufficient:

```
Trend
 -> Prediction
 -> Confidence
 -> Time horizon
 -> Risk assessment
 -> Prepare alternate
 -> Canary/shadow where appropriate
 -> Controlled switch
 -> Verify
 -> Commit or rollback
```

Predictions always carry uncertainty and fallback.

---

## 17. Failure memory and learning

Record strategy outcomes.

Learning updates:

- strategy success probability
- resource reliability
- provider reliability
- destination behavior
- failure correlations
- recovery effectiveness

Learning must be:

- bounded
- explainable
- observable
- reversible
- freshness-aware

Old evidence decays. Failed strategies may be penalized or quarantined but must not be permanently poisoned by stale history.

---

## 18. Federation

Remote nodes are evidence/resource providers, not unrestricted authorities.

Remote node metadata:

- identity
- region
- provider
- capabilities
- capacity
- health
- latency
- trust
- cost
- historical reliability

Remote evidence is normalized locally and remains advisory unless explicit local policy grants a narrowly scoped authority.

Local autonomy must continue when federation disappears.

---

## 19. Security / trust architecture

Security is a platform layer, not an add-on.

Required boundaries:

- device identity
- service identity
- capability-based authorization
- least privilege
- secret isolation
- credential lifecycle
- trust levels
- plugin trust
- remote-node trust
- secure federation
- telemetry classification
- audit trail
- egress/data-flow governance

Sensitive workloads must have explicit egress/trust policy.

Never claim absolute protection from compromise or data leakage; design for prevention, containment, detection and recovery.

---

## 20. Plugin architecture

Plugins extend the platform but never become alternate control planes.

Plugin lifecycle:

```
Discover
 -> Authenticate
 -> Authorize
 -> Load
 -> Sandbox
 -> Observe
 -> Execute allowed capability
 -> Telemetry
 -> Stop/revoke
```

Plugins must obey capability, policy, security and safety boundaries.

---

## 21. API / CLI / client rule

API, CLI, Desktop, Mobile and OS clients are interfaces/adapters.

They do not own privileged network orchestration.

Canonical host composition:

```
Host
 -> createCanonicalRuntime(...)
 -> injected observation/domain adapters
 -> ResilienceRuntime
 -> policy/security/safety
 -> transaction
 -> executor
 -> verifier
```

PR #296 established this composition boundary for daemon and Linux client. Future hosts should reuse the same model.

---

## 22. Data plane

Separate:

- control plane
- knowledge plane
- execution plane
- data plane

The data plane is the actual traffic/connectivity outcome.

The control plane reasons about it and changes it through bounded execution adapters.

Do not claim data-plane orchestration until real platform integration and outcome verification exist.

---

## 23. Persistence model

Keep distinct:

- ephemeral runtime state
- persistent operational state
- historical state
- analytics
- configuration
- identity/security state

Database availability must not unnecessarily block local recovery.

---

## 24. Observability and explainability

Every autonomous decision should be reconstructable:

```
trigger
 -> evidence
 -> diagnosis
 -> candidates
 -> scoring
 -> decision
 -> policy
 -> security
 -> safety
 -> plan
 -> action
 -> verification
 -> outcome
 -> recovery
 -> learning
```

Use correlation/decision/transaction identifiers.

Experts must be able to answer:

- why was this strategy selected?
- what evidence mattered?
- what alternatives were rejected?
- what policy applied?
- what safety guard applied?
- what actually happened?

---

## 25. Platform self-resilience

IRP itself must survive:

- daemon crash
- plugin crash
- database outage
- telemetry outage
- federation outage
- malformed configuration
- stale state
- interrupted transaction
- API outage
- partial startup

Optional intelligence must degrade gracefully:

```
AI unavailable -> deterministic autonomy continues
History unavailable -> local decision continues
Federation unavailable -> local autonomy continues
Telemetry unavailable -> critical control remains safe
```

---

## 26. Simulation / digital twin

Runtime Lab must evolve toward a deterministic network simulation/replay system covering:

- interface failure
- provider failure
- gateway failure
- DNS failure
- route failure
- tunnel failure
- restriction
- latency/loss/jitter degradation
- remote-node disappearance
- federation loss
- stale decisions
- concurrent plans
- rollback failure
- verification failure
- resource churn
- policy changes

Support what-if comparison and incident replay.

Never substitute simulation evidence for real-environment evidence where real infrastructure is required.

---

## 27. Architectural invariants

CI and architecture tests should enforce:

1. `ResilienceRuntime` remains the canonical production orchestration authority.
2. Hosts use canonical runtime composition.
3. No client/API/plugin directly bypasses safety for privileged mutation.
4. AI cannot directly mutate network state.
5. Legacy `NetworkAutopilot` cannot regain production authority.
6. Important mutations have verification.
7. Failed mutations have rollback/recovery semantics.
8. Decisions are stale-state protected.
9. Remote evidence cannot silently become authority.
10. Federation outage does not disable local control.
11. Intent compilation does not itself mutate.
12. Governance remains upstream of privileged execution.
13. Duplicate state/decision/policy/transaction authorities are rejected.
14. Autonomous behavior is observable.
15. Documentation cannot claim implemented behavior without source/runtime evidence.

---

## 28. Architecture ownership map

| Concern | Canonical owner |
|---|---|
| Runtime orchestration | `@irp/resilience-runtime` |
| Host runtime composition | `createCanonicalRuntime` |
| Network domain contracts | `@irp/network`, `@irp/connectivity`, `@irp/routing` |
| Gateway lifecycle/selection | `@irp/gateway-registry` |
| Tunnel lifecycle | `@irp/tunnel` |
| DNS domain/catalog | `@irp/dns` |
| Intelligence/measurements | `@irp/network-intelligence` |
| Historical evidence | `@irp/historical-analysis` through runtime advisory boundary |
| Federation evidence | runtime advisory/federation boundary |
| Security/trust | `@irp/security` + runtime security gates |
| Plugins | plugin packages behind capability/sandbox/policy boundaries |
| Telemetry | `@irp/telemetry` |
| Persistence | `@irp/database` and domain persistence owners |
| Host execution | OS/client adapters |
| API | management/interface boundary |
| CLI | operator/interface boundary |
| Desktop/Mobile | experience/adaptation boundary |
| Safety | canonical runtime safety kernel |
| Transaction | canonical runtime transaction engine |
| Verification | canonical runtime verifier |
| Recovery | canonical runtime recovery authority |

This table is an ownership contract, not a statement that every row is fully mature today.

---

## 29. Current main reality

As of `07eb6427cc71064d22720b88d22d717699dafc9e`:

### Established

- canonical `ResilienceRuntime`
- canonical runtime composition factory
- daemon host composition
- Linux client canonical composition
- closed-loop runtime
- intent compilation/governance/arbitration
- policy/safety/transaction/verification/recovery primitives
- destination-aware networking foundations
- gateway/tunnel/DNS/routing adapters
- historical advisory evidence
- federated advisory evidence
- network intelligence
- plugin/security boundaries
- runtime package integration evidence

### Still architectural work, not to be faked

The following must be treated as target capabilities until executable evidence proves otherwise:

- fully unified production Connectivity Fabric
- complete workload/application-aware orchestration
- full resource scheduler across all fabric resources
- complete multi-objective optimization across all resource/path dimensions
- full predictive pre-positioning
- production-grade digital twin/what-if engine
- complete data-plane traffic engineering
- complete distributed fleet orchestration
- complete end-to-end learning optimization
- complete cross-platform privileged runtime parity
- complete release/distribution certification

Agents MUST inspect current source before deciding which of these are already implemented.

---

## 30. Implementation classification

Every capability must be classified:

- **CONNECTED** — executable producer → contract → consumer → entrypoint → outcome.
- **PARTIALLY_CONNECTED** — real path exists but important contract/runtime boundary remains incomplete.
- **ORPHANED** — implementation exists without a meaningful production consumer.
- **DUPLICATED** — competing implementation/authority exists.
- **LEGACY** — retained for compatibility/replay but not current authority.
- **MISSING** — target capability has no meaningful implementation.

Package existence is never sufficient evidence.

---

## 31. Prohibited architectural drift

Future agents must reject changes that:

- introduce a new phase merely to avoid fixing current architecture
- create a new control plane because integration is inconvenient
- create another decision engine instead of extending the canonical one
- make API/CLI a privileged executor
- let AI execute privileged operations
- turn remote nodes into uncontrolled authorities
- make the database/federation/AI mandatory for local recovery
- replace real integration with mocks
- weaken tests to achieve green CI
- describe planned architecture as implemented
- optimize one global path instead of context-specific outcomes
- treat package count as product maturity

---

## 32. Future implementation rule

Before changing architecture, an agent MUST:

1. read this document;
2. inspect current source and tests;
3. identify the canonical owner;
4. trace the runtime path;
5. determine whether the requested capability already exists partially;
6. extend the canonical owner rather than creating a parallel abstraction;
7. preserve architecture invariants;
8. add runtime/integration evidence;
9. update this document only when the durable architecture itself changes;
10. never invent a competing target architecture.

If a task conflicts with this document, the agent must stop and resolve the architectural contradiction rather than silently designing another system.

---

## 33. Definition of Done

IRP is architecturally complete only when the repository can demonstrate:

```
Intent
 -> Compilation
 -> Governance
 -> Knowledge
 -> Intelligence
 -> Resource discovery
 -> Strategy generation
 -> Optimization
 -> Decision
 -> Policy
 -> Security
 -> Safety
 -> Planning
 -> Scheduling
 -> Transaction
 -> Data-plane execution
 -> Outcome verification
 -> Commit
 -> Recovery when required
 -> Learning
 -> Knowledge update
 -> Next observation
```

with:

- one canonical authority;
- real platform adapters;
- destination/application/workload-aware outcomes;
- observable decisions;
- bounded autonomous behavior;
- security and trust boundaries;
- stale-decision/concurrency protection;
- local-first operation;
- federation without central dependency;
- reproducible failure scenarios;
- real integration tests;
- real runtime evidence;
- deployment evidence;
- no known duplicate production authority.

---

## 34. The permanent north star

The intended final system is:

> **A local-first, autonomous, adaptive, secure, distributed Network Operating System that turns heterogeneous connectivity resources into a programmable fabric and continuously optimizes real connectivity outcomes for users, applications and workloads.**

The implementation may evolve.

The packages may evolve.

The internal algorithms may evolve.

The roadmap may evolve.

**This architectural identity does not.**
