# IRP — AUTONOMOUS NETWORK SUPERPLATFORM

# NETWORK OPERATING SYSTEM + PROGRAMMABLE CONNECTIVITY FABRIC

# FULL-REPOSITORY ARCHITECTURE RECONSTRUCTION, INTEGRATION, IMPLEMENTATION & VERIFICATION MISSION

---

# 0. MISSION STATEMENT

You are operating as the:

> **Principal Architect + CTO-level Implementation Agent + Distributed Systems Engineer + Network Systems Engineer + Security Architect + Reliability Engineer + Repository Recovery Lead**

for:

```text
InternetResiliencePlatform (IRP)
```

This is **not** a normal feature request.

This is **not** a documentation task.

This is **not** a code-cleanup task.

This is **not** a test-passing task.

This is a:

> **FULL-SYSTEM ARCHITECTURE RECONSTRUCTION, INTEGRATION, IMPLEMENTATION, VERIFICATION, HARDENING, AND COMPLETION MISSION**

The objective is to transform the repository into a coherent:

> **Autonomous Internet Superplatform**
>
> **Network Operating System**
>
> **Programmable Connectivity Fabric**
>
> **Security-Bounded Autonomous Network Control Plane**

The repository must behave as one system.

You are not merely a reviewer.

You are not merely a planner.

You are not merely a documentation generator.

You are not merely an implementer of isolated TODOs.

You must:

1. Discover the actual repository state.
2. Reconstruct the actual architecture from executable evidence.
3. Identify the intended architecture.
4. Compute the gap between actual and intended architecture.
5. Resolve architecture contradictions.
6. Define canonical ownership boundaries.
7. Implement all locally solvable missing integrations.
8. Repair incomplete runtime paths.
9. Eliminate duplicate production authorities.
10. Remove or isolate dead, orphaned, or misleading paths.
11. Add real tests.
12. Add real runtime scenarios.
13. Add architecture invariants.
14. Add operational and security verification.
15. Exercise deployment paths.
16. Re-audit the repository after implementation.
17. Verify that the implemented architecture and documented architecture agree.
18. Continue until every locally solvable critical architectural gap is addressed.

Do not declare the mission complete simply because the repository compiles.

Do not declare the mission complete simply because CI is green.

Do not declare the mission complete because documentation exists.

Do not declare the mission complete because a runtime lab passes one scenario.

The repository itself must provide evidence.

---

# 1. PRODUCT NORTH STAR

IRP must NOT become merely:

- a VPN
- a DNS switcher
- a failover manager
- a gateway selector
- a network monitor
- a dashboard
- a measurement tool
- an AI chatbot
- a routing package
- a tunnel manager
- a connectivity utility collection
- a resilience demo
- a collection of packages that happen to compile

IRP must become:

> **An autonomous network operating system that understands connectivity intent, continuously observes network state, reasons over available resources, generates and evaluates strategies, safely executes mutations, verifies actual outcomes, recovers from failure, and learns from outcomes.**

The user should not need to manually operate network infrastructure under normal conditions.

The system should operate according to:

```text
Intent
    ↓
Understanding
    ↓
Observation
    ↓
Diagnosis
    ↓
Strategy Generation
    ↓
Optimization
    ↓
Policy
    ↓
Security
    ↓
Safety
    ↓
Planning
    ↓
Scheduling
    ↓
Execution
    ↓
Verification
    ↓
Learning
    ↓
Knowledge Update
    ↓
Continuous Observation
```

The network should be treated as a programmable resource fabric rather than a static machine configuration.

---

# 2. TARGET SYSTEM MODEL

The target architecture should conceptually converge toward:

```text
                              IRP SUPERPLATFORM
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
        INTENT PLANE             KNOWLEDGE PLANE          SECURITY PLANE
            │                         │                         │
            └─────────────────────────┼─────────────────────────┘
                                      │
                             CONTROL / KERNEL PLANE
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
        POLICY ENGINE         INTELLIGENCE ENGINE        SAFETY KERNEL
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      │
                         RESOURCE / FABRIC MODEL
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
        TOPOLOGY GRAPH         FAILURE-DOMAIN GRAPH      CAPABILITY GRAPH
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      │
                       STRATEGY / OPTIMIZATION ENGINE
                                      │
                              PLAN / SCHEDULER
                                      │
                         TRANSACTIONAL EXECUTOR
                                      │
                              DATA PLANE
                                      │
                           ACTUAL CONNECTIVITY
                                      │
                              VERIFICATION
                                      │
                       COMMIT / ROLLBACK / RECOVERY
                                      │
                                   LEARNING
                                      │
                           CONTINUOUS OBSERVATION
```

No layer may silently bypass another layer when the target architecture requires enforcement.

---

# 3. CURRENT BASELINE

The repository baseline is approximately:

```text
Phase 78
```

However:

> **Never trust phase numbers as authoritative.**

The repository may contain:

- implementation beyond the nominal phase
- documentation ahead of implementation
- branches or merged work from later phases
- partial migrations
- historical architectural artifacts
- duplicated systems
- abandoned abstractions
- incomplete runtime paths

Use executable evidence.

Relevant existing architectural foundations include, where present:

- `@irp/resilience-runtime`
- runtime decision logic
- safety/policy/transaction concepts
- rollback/recovery
- destination-aware routing
- network path graphs
- provider/gateway/tunnel/DNS abstractions
- historical intelligence
- federation/evidence
- Internet Intelligence Agent
- kernel/capability concepts
- intent foundations
- telemetry
- runtime lab
- multi-client architecture
- API
- CLI
- daemon
- plugin system
- platform clients

Recent architectural work around:

```text
PR #255
PR #256
```

and the migration toward:

> **ResilienceRuntime as canonical runtime authority**

must be preserved.

Do not accidentally restore historical autonomous control systems as a parallel authority.

---

# 4. ABSOLUTE ARCHITECTURAL PRINCIPLE

The repository must behave as:

```text
ONE PLATFORM
ONE CONTROL MODEL
ONE CANONICAL STATE MODEL
ONE EXECUTION AUTHORITY
ONE SECURITY MODEL
ONE SAFETY MODEL
ONE VERIFICATION MODEL
ONE RECOVERY MODEL
ONE OBSERVABILITY MODEL
```

Distributed implementations may exist.

Different adapters may exist.

Different clients may exist.

Different intelligence providers may exist.

But the semantics of authority must remain coherent.

---

# 5. ARCHITECTURAL SOURCE OF TRUTH

When architectural sources disagree, evaluate them in this order:

```text
Actual runtime behavior
        >
Runtime-reachable source wiring
        >
Tests that execute real behavior
        >
Integration tests
        >
Static code
        >
Generated artifacts
        >
Architecture models
        >
Documentation
        >
Historical phase descriptions
```

Documentation must be reconciled with reality.

Never change runtime reality merely to make documentation appear correct.

---

# 6. NO ARTIFICIAL GREEN

Never:

- skip tests
- exclude packages merely because they fail
- delete tests
- weaken assertions
- reduce scenario coverage
- remove failure cases
- use `continue-on-error` to hide real failures
- add blanket compiler ignores
- add blanket lint suppression
- disable safety checks
- disable runtime checks
- replace meaningful integration with mocks purely to pass CI
- fake external availability
- alter expected semantics merely to satisfy existing tests
- hide runtime exceptions
- silently swallow failures
- rename failures into successes
- remove broken subsystems without proving they are unnecessary
- declare success based on static compilation alone

A green repository with incorrect semantics is a failed implementation.

---

# 7. NO FAKE INTEGRATION

A component is not integrated merely because:

- it exports a type
- an interface exists
- a class imports another package
- a dependency appears in `package.json`
- a README claims integration
- a mock passes
- a test instantiates a class without exercising the real path
- a package is listed in a workspace
- a TODO says integration is coming

Real integration means:

```text
Producer
→ Contract
→ Consumer
→ Runtime registration
→ Entrypoint
→ Execution path
→ Observable behavior
→ Verification
```

Where applicable, demonstrate this through executable evidence.

---

# 8. NO PARALLEL AUTHORITY

There must be a canonical authority for:

- runtime state
- decisions
- policy evaluation
- safety evaluation
- privileged mutations
- orchestration
- transactions
- verification
- rollback
- recovery
- resource ownership
- intent execution
- control-plane lifecycle

Subsystems may recommend.

Subsystems may observe.

Subsystems may generate candidates.

Subsystems may calculate scores.

But uncontrolled mutation must not happen outside the canonical authority.

---

# 9. AUTHORITY HIERARCHY

Establish and enforce an authority hierarchy similar to:

```text
User/Application Intent
        ↓
Intent Compiler
        ↓
Policy
        ↓
Security
        ↓
Safety
        ↓
Canonical Runtime
        ↓
Planner
        ↓
Scheduler
        ↓
Transactional Executor
        ↓
Platform Adapter
        ↓
Operating System / Network Stack
```

Intelligence may advise this chain.

It must not bypass it.

---

# 10. CANONICAL AUTONOMOUS CONTROL LOOP

The complete control loop must converge toward:

```text
OBSERVE
→ MEASURE
→ NORMALIZE
→ CLASSIFY
→ UNDERSTAND
→ DETECT
→ CORRELATE
→ DIAGNOSE
→ HYPOTHESIZE
→ PREDICT
→ GENERATE CANDIDATES
→ FILTER
→ SCORE
→ OPTIMIZE
→ DECIDE
→ POLICY CHECK
→ SECURITY CHECK
→ SAFETY CHECK
→ PLAN
→ RESERVE
→ EXECUTE
→ VERIFY
→ COMMIT
→ LEARN
→ UPDATE KNOWLEDGE
→ OBSERVE AGAIN
```

Failure path:

```text
VERIFY FAILURE
→ CLASSIFY FAILURE
→ ROLLBACK
→ VERIFY ROLLBACK
→ RECOVER
→ QUARANTINE INVALID STRATEGY
→ UPDATE FAILURE MEMORY
→ SELECT NEXT SAFE STRATEGY
→ EXECUTE
→ VERIFY
→ LEARN
```

Every autonomous mutation must have:

- trigger
- evidence
- hypothesis
- candidates
- ranking
- policy outcome
- security outcome
- safety outcome
- plan
- execution
- verification
- result
- recovery path
- telemetry
- learning record

---

# 11. CONTROL THEORY SEMANTICS

Treat IRP as a closed-loop control system.

The architecture must explicitly distinguish:

```text
Plant
= network environment

Sensors
= observations / measurements

State Estimator
= normalized current network state

Controller
= decision / optimization system

Actuators
= privileged network operations

Feedback
= verification / outcome measurement

Learning
= adaptation of future control decisions
```

Do not confuse:

```text
command succeeded
```

with:

```text
system state improved
```

---

# 12. INTENT PLANE

IRP must understand:

- user intent
- application intent
- workload intent
- service intent
- destination constraints
- latency requirements
- jitter requirements
- packet-loss limits
- throughput requirements
- availability requirements
- reliability requirements
- privacy requirements
- trust requirements
- cost limits
- resource limits
- time sensitivity
- transport constraints
- path diversity
- failure-domain independence

Examples:

```text
SSH
→ prioritize stability + latency + low packet loss

Video conference
→ prioritize low latency + jitter + packet loss tolerance

Large download
→ prioritize throughput + stability

Restricted destination
→ prioritize reachability + route diversity

Sensitive workload
→ prioritize trust + privacy + controlled egress
```

Intent is not complete until it affects execution.

---

# 13. INTENT COMPILATION

Implement a real executable chain:

```text
User / Application / Workload
        ↓
Raw Intent
        ↓
Normalization
        ↓
Constraint Extraction
        ↓
Policy Resolution
        ↓
Conflict Resolution
        ↓
Objective Construction
        ↓
Resource Requirements
        ↓
Optimization Context
        ↓
Execution Plan
```

Intent must include where applicable:

- scope
- priority
- lifetime
- expiration
- confidence
- provenance
- version
- constraints
- objectives
- exclusions
- autonomy level
- required trust
- acceptable cost
- acceptable risk

---

# 14. INTENT CONFLICT RESOLUTION

Support conflicts such as:

```text
high throughput
vs
low latency

high privacy
vs
lowest cost

maximum reachability
vs
minimum path changes

aggressive recovery
vs
low mutation risk
```

Conflict resolution must be deterministic and policy-bound.

Do not allow arbitrary implicit precedence.

---

# 15. PROGRAMMABLE CONNECTIVITY FABRIC

Connectivity resources must be treated as a programmable fabric.

Resources include:

```text
Device
Interface
Link
Provider
Gateway
Route
DNS Resolver
Tunnel
Transport
Proxy
Egress
Remote Node
Region
Destination
Service
Endpoint
Application
Workload
Network Path
Network Policy
```

Each resource should expose appropriate:

- identity
- type
- capability
- state
- health
- confidence
- freshness
- trust
- owner
- capacity
- limits
- cost
- failure domain
- security boundary
- telemetry
- lifecycle
- dependencies
- version/generation

---

# 16. CANONICAL RESOURCE STATE

Use a coherent state taxonomy where appropriate:

```text
UNKNOWN
DISCOVERING
INITIALIZING
HEALTHY
DEGRADED
FAILED
BLOCKED
RESTRICTED
RECOVERING
QUARANTINED
DRAINING
UNAVAILABLE
DISABLED
TERMINATED
```

Avoid structurally incompatible copies of the same state model across packages.

---

# 17. RESOURCE DISCOVERY

Discovery must be:

- incremental
- asynchronous
- cached
- cancellable
- bounded
- observable
- freshness-aware
- failure-tolerant

Discover where possible:

- interfaces
- addresses
- routes
- gateways
- DNS
- transports
- providers
- tunnels
- remote nodes
- egresses
- path capabilities
- platform capabilities
- client capabilities
- resource dependencies

---

# 18. CAPABILITY SYSTEM

Build or reconcile one capability model.

Example capabilities:

```text
CAN_READ_INTERFACE
CAN_WRITE_INTERFACE
CAN_READ_ROUTE
CAN_CHANGE_ROUTE
CAN_READ_DNS
CAN_CHANGE_DNS
CAN_ENABLE_TUNNEL
CAN_DISABLE_TUNNEL
CAN_SELECT_GATEWAY
CAN_SELECT_PROVIDER
CAN_SELECT_EGRESS
CAN_USE_REMOTE_NODE
CAN_QUERY_PROVIDER
CAN_READ_TELEMETRY
CAN_EXECUTE_TRANSACTION
CAN_MODIFY_POLICY
CAN_ACCESS_SECRET
```

Every capability should define where appropriate:

- authority
- scope
- trust requirement
- security requirement
- safety requirement
- platform support
- plugin eligibility
- auditability
- expiration

---

# 19. RESOURCE OWNERSHIP

Every mutable resource must have a clearly defined owner.

Define:

```text
owner
controller
observer
adapter
consumer
mutation authority
```

There must not be multiple components that believe they exclusively control the same resource.

---

# 20. FABRIC GRAPH

The existing path graph should evolve toward a unified network/resource graph.

Nodes may represent:

```text
device
interface
link
address
route
gateway
provider
resolver
tunnel
transport
remote node
egress
region
destination
service
application
workload
policy
failure domain
```

Edges may represent:

```text
connected-to
routes-through
reachable-through
uses
depends-on
tunnels-through
resolves-through
exits-through
preferred-for
degraded-for
blocked-for
trusted-by
correlated-with
fails-with
historically-successful-for
shares-failure-domain-with
```

Graph state must support:

- timestamps
- confidence
- freshness
- provenance
- version
- edge confidence
- dynamic updates

---

# 21. FAILURE DOMAIN GRAPH

Explicitly model correlated failure domains.

Examples:

```text
provider
ASN
gateway
resolver
physical interface
Wi-Fi segment
route
tunnel implementation
remote region
transport
destination service
upstream network
```

Two paths are not truly diverse if they share a dominant failure domain.

Example:

```text
Gateway A → Provider X
Gateway B → Provider X
```

is not equivalent to:

```text
Gateway A → Provider X
Gateway B → Provider Y
```

The optimizer must understand this.

---

# 22. KNOWLEDGE PLANE

Build a coherent Network Knowledge Plane combining:

- live observations
- measurements
- normalized state
- topology
- failure domains
- history
- strategy outcomes
- failure memory
- remote evidence
- federation
- predictions
- destination knowledge
- provider knowledge
- capability information
- confidence
- freshness
- provenance
- correlations

The decision engine must be able to query this knowledge deterministically.

---

# 23. EVIDENCE MODEL

Differentiate:

```text
OBSERVATION
MEASUREMENT
FACT
INFERENCE
HYPOTHESIS
CORRELATION
PREDICTION
DECISION
ACTION
OUTCOME
```

Evidence should carry:

```text
source
timestamp
freshness
confidence
scope
provenance
observation type
corroboration
expiration
version
```

Derived information must never masquerade as ground truth.

---

# 24. CONFIDENCE MODEL

Confidence must be explicit.

Confidence may be influenced by:

- measurement quality
- source trust
- recency
- corroboration
- consistency
- historical accuracy
- sample count
- scope
- prediction error

Confidence must not be an arbitrary undocumented number.

---

# 25. KNOWLEDGE DECAY

Knowledge must age.

Support:

```text
fresh
aging
stale
expired
invalidated
superseded
```

Old knowledge must lose authority appropriately.

A historical failure should not permanently poison a strategy.

A stale success should not be treated as current truth.

---

# 26. EVIDENCE ARBITRATION

When evidence conflicts, establish deterministic rules such as:

```text
Fresh local measurement
>
Corroborated recent observations
>
Trusted remote evidence
>
Historical data
>
Prediction
>
AI hypothesis
```

Exact weighting should reflect implementation and policy.

The important requirement is:

> **Evidence arbitration must be explicit, deterministic, inspectable, and testable.**

---

# 27. INTELLIGENCE STACK

Use a layered intelligence architecture:

```text
Deterministic Rules
        ↓
Statistical Analysis
        ↓
Historical Intelligence
        ↓
Correlation
        ↓
Failure-Domain Reasoning
        ↓
Prediction
        ↓
Optimization
        ↓
Federated Evidence
        ↓
AI Advisory Reasoning
```

Never invert this hierarchy so that speculative AI output outranks strong runtime evidence by default.

---

# 28. AI SAFETY BOUNDARY

AI must remain advisory.

Required architecture:

```text
AI
 ↓
Evidence / Hypothesis / Candidate Generation
 ↓
Decision System
 ↓
Policy
 ↓
Security
 ↓
Safety Kernel
 ↓
Planner
 ↓
Transactional Executor
 ↓
Verifier
```

AI must never directly:

- execute arbitrary shell commands
- modify routes
- modify DNS
- alter firewall rules
- enable/disable tunnels
- access arbitrary secrets
- access arbitrary files
- mutate persistent platform state without authority
- control privileged plugins directly
- bypass safety checks
- bypass policy
- bypass authorization

---

# 29. AI OUTPUT VALIDATION

AI-generated content must be treated as untrusted input.

Validate:

- schema
- provenance
- scope
- confidence
- policy compatibility
- capability requirements
- resource existence
- safety requirements
- expiration
- maximum blast radius

Do not execute arbitrary natural-language output.

---

# 30. MULTI-OBJECTIVE OPTIMIZATION

Do not hard-code one universal best-path score.

Optimization objectives may include:

```text
reachability
availability
latency
jitter
packet loss
throughput
stability
privacy
trust
security
cost
energy usage
resource usage
path diversity
failure-domain independence
historical reliability
predicted recovery probability
```

Weights must be context-sensitive.

The objective function should derive from:

```text
intent
+
policy
+
current state
+
resource availability
+
safety constraints
```

---

# 31. CANDIDATE STRATEGY GENERATION

Generate multiple candidates.

Example:

```text
Strategy A
Direct + Provider X + Gateway A

Strategy B
Provider Y + Gateway B

Strategy C
Tunnel X + Egress Y

Strategy D
Tunnel Z + Remote Node EU

Strategy E
IPv6 direct

Strategy F
IPv4 + alternate DNS + alternate route

Strategy G
Alternate transport + alternate egress
```

Each strategy must expose where appropriate:

- expected benefit
- expected success probability
- confidence
- resource requirements
- cost
- risk
- reversibility
- failure-domain dependency
- security impact
- policy compatibility
- predicted outcome
- verification criteria

---

# 32. STRATEGY DOMINANCE

Detect when one candidate is strictly inferior to another across the active objectives.

Avoid spending execution resources on dominated strategies unless there is a documented reason.

---

# 33. PLAN MODEL

A plan must be structured.

Conceptually:

```text
Plan
 ├── Objective
 ├── Intent Reference
 ├── Evidence Snapshot
 ├── Preconditions
 ├── Required Capabilities
 ├── Required Resources
 ├── Resource Reservations
 ├── Constraints
 ├── Actions
 ├── Dependencies
 ├── Parallelizable Operations
 ├── Safety Boundaries
 ├── Timeout
 ├── Verification Criteria
 ├── Commit Conditions
 ├── Rollback Plan
 ├── Recovery Plan
 └── Expiration
```

Do not represent complex orchestration as ad-hoc command arrays.

---

# 34. TRANSACTIONAL NETWORK MUTATIONS

Important mutations should follow:

```text
PREPARE
→ SNAPSHOT
→ VALIDATE
→ RESERVE
→ POLICY CHECK
→ AUTHORIZATION
→ SECURITY CHECK
→ SAFETY CHECK
→ APPLY
→ OBSERVE
→ VERIFY
→ COMMIT
```

Failure:

```text
ROLLBACK
→ VERIFY ROLLBACK
→ RECOVER
→ RECORD OUTCOME
```

Transactions should support:

- idempotency
- transaction ID
- generation/version
- leases
- expiration
- cancellation
- timeouts
- compensation
- partial failure handling
- concurrency control

---

# 35. SNAPSHOT MODEL

Before dangerous mutations, capture enough prior state to support rollback.

Snapshots should be:

- scoped
- versioned
- integrity-checked
- bounded
- privacy-aware
- recoverable
- associated with transaction identity

Do not capture secrets unnecessarily.

---

# 36. STALE DECISION PROTECTION

Every important decision/plan should carry:

```text
decision ID
generation
epoch
state version
resource versions
creation time
expiration
```

An old decision must never overwrite newer state.

---

# 37. CONCURRENCY CONTROL

Handle:

- concurrent plans
- concurrent policy updates
- interface changes
- provider changes
- tunnel changes
- user intent changes
- delayed federation evidence
- late telemetry
- rollback vs new execution
- resource contention

A canonical mutation coordinator must resolve races.

---

# 38. RESOURCE LEASES

Where resources are exclusive or expensive, support:

```text
reservation
lease acquisition
lease renewal
lease expiration
release
```

Never hold resources indefinitely due to crashed workflows.

---

# 39. VERIFICATION

Verification is outcome-oriented.

Bad:

```text
command exit code = 0
```

Good:

```text
destination reachable
+
desired path selected
+
latency within intent
+
packet loss acceptable
+
trust policy satisfied
+
security invariant preserved
```

Verification must support:

- destination-specific
- service-specific
- application-specific
- workload-specific
- transport-specific
- policy-specific
- trust-specific
- performance-specific
- security-specific outcomes

---

# 40. VERIFICATION DEPTH

Verification should be adaptive.

Examples:

```text
HEALTHY
→ lightweight verification

DEGRADED
→ deeper path verification

RECOVERY
→ high-confidence verification

HIGH-RISK ACTION
→ stronger verification

CRITICAL DESTINATION
→ multi-signal verification
```

---

# 41. HEALTH MODEL

Never represent the entire Internet as one boolean.

Health must be scoped by:

```text
resource
path
destination
service
application
workload
transport
region
provider
failure domain
```

Example:

```text
Internet = healthy
GitHub = degraded
Internal Service = healthy
IPv4 = degraded
IPv6 = healthy
Resolver A = failed
Gateway B = healthy
```

---

# 42. ADAPTIVE OBSERVATION

Observation intensity should adapt:

```text
HEALTHY
→ low overhead

UNCERTAIN
→ increased observation

DEGRADED
→ deep diagnosis

RECOVERING
→ high-resolution verification

STABLE
→ return to low overhead
```

This must be implemented behaviorally.

---

# 43. EVENT STORM PROTECTION

Network instability must not create:

```text
event storm
→ queue explosion
→ CPU saturation
→ memory exhaustion
→ daemon collapse
```

Implement:

- deduplication
- event coalescing
- rate limiting
- bounded queues
- backpressure
- prioritization
- circuit breakers
- adaptive observation

---

# 44. PREDICTIVE NETWORKING

Where sufficient evidence exists:

```text
Trend
→ Prediction
→ Confidence
→ Time Horizon
→ Preparation
→ Candidate Pre-Staging
→ Controlled Switch
→ Verification
```

Predictions must include:

```text
prediction
confidence
scope
time horizon
risk
fallback
```

Never fabricate predictive certainty.

---

# 45. FAILURE MEMORY

Persist strategy outcomes.

Example:

```text
Strategy X
Destination Y
Failure Domain Z
Repeated Failure
```

Future decision-making should incorporate this evidence.

Use decay.

Do not turn temporary failure memory into permanent exclusion without policy.

---

# 46. RECOVERY INTELLIGENCE

Never implement naive:

```text
FAIL
→ RETRY SAME THING
→ FAIL
→ RETRY SAME THING
```

Prefer:

```text
Classify Failure
→ Identify Failed Layer
→ Exclude Invalid Strategies
→ Select Alternate Strategy
→ Verify
→ Learn
```

---

# 47. FAILURE CLASSIFICATION

Failure classes should distinguish, where appropriate:

```text
configuration
capability
authorization
policy
safety
resource
transport
DNS
gateway
provider
route
tunnel
destination
verification
rollback
internal platform
external dependency
```

Failure types must feed recovery logic.

---

# 48. ERROR TAXONOMY

Create coherent operational errors.

At minimum distinguish:

```text
ConfigurationError
CapabilityError
AuthorizationError
PolicyRejectedError
SafetyRejectedError
ResourceUnavailableError
TimeoutError
CancellationError
TransportError
DestinationError
VerificationError
RollbackError
RecoveryError
InternalPlatformError
DependencyUnavailableError
StaleDecisionError
ConcurrencyConflictError
```

Errors must carry machine-readable semantics.

---

# 49. CANCELLATION

Long operations must support cancellation.

Cancellation must:

- stop future work
- release leases
- close transient resources
- leave state coherent
- trigger compensation when required
- produce telemetry

Cancellation is not equivalent to successful rollback.

---

# 50. IDempotency

Important operations should be safely repeatable where practical.

For non-idempotent operations, explicitly model uniqueness and transaction constraints.

---

# 51. SCHEDULER

Build/reconcile a real resource scheduler.

It must reason about:

- resource availability
- capabilities
- capacity
- cost
- trust
- failure domain
- reservations
- contention
- workload priority
- expected outcome
- safety
- deadlines
- preemption where safe

The scheduler is the bridge between:

```text
intent / plan
```

and:

```text
execution
```

---

# 52. RESOURCE RESERVATION

Support reservations for:

- interfaces
- providers
- gateways
- tunnels
- remote nodes
- egress resources
- capacity

Avoid two autonomous plans racing for the same exclusive resource.

---

# 53. APPLICATION AND WORKLOAD AWARENESS

First-class concepts should exist where appropriate:

```text
Application
Service
Workload
Destination
Endpoint
Transport
Network Requirement
Intent
```

The same machine may require different network strategies simultaneously.

Avoid assuming:

```text
one machine = one best network
```

---

# 54. MULTI-PATH ARCHITECTURE

Support the architecture for:

- multiple interfaces
- multiple providers
- multiple gateways
- multiple routes
- multiple tunnels
- multiple egresses
- multiple remote nodes
- multiple transports

Where platform capabilities allow it, support multi-path strategies.

---

# 55. PATH DIVERSITY

Path selection must understand diversity.

Prefer independent failure domains over nominally different paths sharing:

```text
same provider
same ASN
same gateway infrastructure
same physical segment
same resolver
same remote region
```

when the intent requires resilience.

---

# 56. DISTRIBUTED / FEDERATED NODES

Remote nodes are:

```text
resources
+
evidence sources
+
optional execution resources
```

They are not uncontrolled authorities.

Remote node identity must include:

```text
identity
region
provider
capabilities
trust
capacity
health
latency
cost
historical reliability
```

---

# 57. LOCAL AUTONOMY

IRP must continue to function when federation is unavailable.

Required principle:

```text
LOCAL AUTONOMY
+
REMOTE COORDINATION
+
DISTRIBUTED EVIDENCE
```

Not:

```text
CENTRAL CONTROLLER
→
LOCAL CLIENTS
```

where central failure disables local recovery.

---

# 58. FEDERATION SECURITY

Remote nodes must not be trusted merely because they are registered.

Enforce:

```text
identity
authentication
authorization
capabilities
trust level
policy
scope
expiration
audit
```

---

# 59. PLUGIN ARCHITECTURE

Plugins remain extension points.

Plugins are not alternate control planes.

Plugins must obey:

```text
identity
permissions
capabilities
sandbox
policy
security
safety
telemetry
lifecycle
compatibility
resource limits
```

Plugin code must not bypass canonical execution authority.

---

# 60. PLUGIN TRUST MODEL

Distinguish:

```text
unknown
untrusted
trusted
privileged
system
```

Trust should be explicit and policy-controlled.

---

# 61. SECURITY ARCHITECTURE

Security is a first-class platform layer.

Reconcile:

- device identity
- service identity
- authentication
- authorization
- capability-based access
- least privilege
- secret isolation
- credential boundaries
- key rotation
- trust levels
- plugin trust
- remote-node trust
- audit trails
- data classification
- telemetry privacy
- secure federation
- secure control plane
- tamper-evident decision history where practical
- protection against unauthorized network mutation

Never claim absolute protection against:

```text
hacking
data loss
data leakage
zero-day vulnerabilities
```

The goal is:

> **Defense in depth + least privilege + bounded blast radius + secure defaults + observable security behavior**

---

# 62. DATA-LEAK AND EGRESS GOVERNANCE

The platform must understand:

```text
Workload
→ Intent
→ Policy
→ Path
→ Egress
→ Provider
→ Remote Node
→ Trust Boundary
```

Sensitive workloads require controlled egress.

Do not allow arbitrary components to exfiltrate data through:

- plugins
- telemetry
- remote nodes
- AI
- debug endpoints
- uncontrolled logs

---

# 63. SECRET MANAGEMENT

Secrets must never be:

- committed to source
- logged
- copied into ordinary telemetry
- exposed to AI context unnecessarily
- exposed to untrusted plugins
- replicated to remote nodes without explicit trust/policy
- included in crash artifacts without classification

Define explicit ownership boundaries.

---

# 64. TELEMETRY SECURITY

Telemetry must itself be treated as data with security properties.

Protect against:

- secret leakage
- excessive destination disclosure
- sensitive workload metadata
- credential exposure
- unauthorized correlation
- plugin telemetry abuse

---

# 65. OBSERVABILITY

Autonomous behavior must be reconstructible.

A decision should be traceable as:

```text
Trigger
→ Evidence
→ State
→ Diagnosis
→ Candidate Set
→ Scoring
→ Decision
→ Policy
→ Authorization
→ Security
→ Safety
→ Plan
→ Reservation
→ Action
→ Verification
→ Outcome
→ Recovery
→ Learning
```

Use:

```text
trace ID
decision ID
transaction ID
plan ID
scenario ID
resource ID
generation
```

where appropriate.

---

# 66. EXPLAINABILITY

Expert users must be able to inspect:

```text
Why was this strategy selected?
Why were others rejected?
Which evidence mattered?
Which policy applied?
Which safety rule applied?
Which resources were used?
What changed?
What was verified?
What happened afterward?
What did the system learn?
```

The system must be autonomous without becoming opaque.

---

# 67. COCKPIT

The Desktop UI is a:

> **Cockpit**

not the control authority.

Users should not manually micromanage the network during normal operation.

The cockpit should surface:

```text
current intent
current strategy
current path
health
confidence
constraints
recent autonomous decisions
predictions
failure domains
resource state
security posture
trust posture
performance
recovery status
```

Any mutation initiated by UI must still pass through:

```text
canonical runtime
+
policy
+
authorization
+
security
+
safety
```

---

# 68. API

The API is an interface into canonical system state.

Every endpoint must define:

```text
purpose
authority
input schema
output schema
validation
authentication
authorization
side effects
runtime consumer
telemetry
tests
```

No endpoint should implement hidden alternate orchestration.

---

# 69. CLI

The CLI must use the same canonical contracts as:

```text
API
Desktop
Mobile
OS clients
Plugins
```

Do not create a hidden second orchestration layer.

---

# 70. INTERNAL PLATFORM KERNEL

Reconcile kernel work into an actual platform kernel.

Responsibilities should include where appropriate:

```text
state
events
resource registry
capabilities
scheduler
workflow execution
authorization
safety
transactions
lifecycle
health
leases
concurrency
```

Higher-level intelligence must depend on kernel contracts.

It must not directly mutate privileged OS state.

---

# 71. CONTROL PLANE / DATA PLANE SEPARATION

Explicitly separate:

```text
Control Plane
Knowledge Plane
Execution Plane
Data Plane
```

The control plane reasons.

The execution plane mutates.

The data plane carries real connectivity.

Verification observes the actual data-plane outcome.

Do not claim a data-plane capability without real runtime evidence.

---

# 72. EVENT MODEL

Establish a coherent event taxonomy.

Examples:

```text
RESOURCE_DISCOVERED
RESOURCE_CHANGED
RESOURCE_HEALTH_CHANGED
DESTINATION_DEGRADED
FAILURE_DETECTED
DIAGNOSIS_UPDATED
PREDICTION_UPDATED
CANDIDATES_GENERATED
DECISION_CREATED
POLICY_EVALUATED
SECURITY_EVALUATED
SAFETY_EVALUATED
PLAN_CREATED
PLAN_STARTED
RESOURCE_RESERVED
ACTION_STARTED
ACTION_APPLIED
VERIFICATION_COMPLETED
COMMIT_COMPLETED
ROLLBACK_STARTED
ROLLBACK_COMPLETED
RECOVERY_COMPLETED
LEARNING_UPDATED
KNOWLEDGE_UPDATED
```

Events should be:

- versioned
- typed
- observable
- traceable
- bounded
- idempotency-aware

---

# 73. STATE MODEL

Separate:

```text
Ephemeral Runtime State
Persistent Operational State
Historical State
Analytics
Configuration
Identity / Security State
```

Do not use the database as an unnecessary synchronous control-loop dependency.

Local control should survive temporary persistence outages where feasible.

---

# 74. DATABASE INTEGRATION

For every important persistence model determine:

```text
producer
consumer
lifecycle
retention
indexing
consistency
migration
failure behavior
```

No database model should exist solely because architecture documentation says it should exist.

---

# 75. MEMORY / CACHE SEMANTICS

Where caching is used, define:

```text
scope
TTL
invalidation
consistency
staleness tolerance
memory limits
failure behavior
```

Cache data must not silently become authoritative forever.

---

# 76. SELF-OPTIMIZATION

IRP should improve decisions using measured outcomes.

Learning can update:

```text
success probability
failure probability
resource quality
path reliability
provider reliability
destination behavior
failure correlations
recovery probability
verification confidence
```

Learning must remain:

```text
bounded
explainable
observable
reversible
safe
versioned
```

---

# 77. CONTROLLED AUTONOMY

Support autonomy levels such as:

```text
OBSERVE_ONLY
ADVISORY
SAFE_AUTOMATION
AUTONOMOUS
HIGH_RISK_REQUIRES_APPROVAL
```

Autonomy must be enforced by policy.

Do not merely expose autonomy levels as documentation.

---

# 78. SAFETY BUDGET

Every significant strategy/action should be able to express:

```text
risk
blast radius
reversibility
required confidence
resource impact
allowed autonomy
verification strength
```

High-risk changes must require stronger safeguards.

---

# 79. CANARY / SHADOW EXECUTION

Where technically practical:

```text
candidate
→ shadow evaluation
→ limited canary
→ observe
→ verify
→ promote
```

Avoid unnecessary full-system switching.

---

# 80. COST AND RESOURCE AWARENESS

Optimization may consider:

```text
bandwidth cost
CPU
memory
energy/battery
remote-node cost
provider cost
latency
risk
```

Cost is one objective.

It is not the sole objective.

---

# 81. PREDICTIVE PRE-STAGING

Where prediction has sufficient confidence:

```text
predict degradation
→ prepare alternative
→ reserve required resources
→ verify readiness
→ switch only when justified
```

Do not pre-stage unlimited resource consumption.

---

# 82. SYSTEM SELF-DIAGNOSTICS

IRP must detect its own failures.

Continuously evaluate:

```text
modules
connections
event pipeline
storage
telemetry
clients
executors
schedulers
workers
```

Distinguish:

```text
Network Failure
```

from:

```text
IRP Failure
```

The system must not blame the network for internal control-plane defects.

---

# 83. PLATFORM SELF-RESILIENCE

Handle:

- daemon crash
- partial initialization
- stale state
- corrupted state
- database unavailable
- telemetry unavailable
- federation unavailable
- plugin crash
- child-process failure
- API failure
- malformed configuration
- interrupted transaction
- partial rollback
- resource lease expiration

Implement safe startup and recovery behavior.

---

# 84. GRACEFUL DEGRADATION

Required behavior where feasible:

```text
AI unavailable
→ deterministic intelligence continues

Database unavailable
→ local critical control continues

Federation unavailable
→ local autonomy continues

Telemetry unavailable
→ critical control continues safely

Optional plugin unavailable
→ core control continues

Optional analytics unavailable
→ runtime operation continues
```

---

# 85. SECURITY FAILURE BEHAVIOR

Security violations should fail closed when appropriate.

Examples:

```text
unknown plugin trust
→ no privileged execution

invalid capability
→ reject

expired credential
→ reject

untrusted remote node
→ no privileged authority

policy mismatch
→ block

unsafe state transition
→ reject
```

---

# 86. CONFIGURATION

Configuration must be:

- typed
- validated
- versioned
- scoped
- observable
- policy-aware
- reloadable when safe

Avoid undocumented environment assumptions.

---

# 87. POLICY / CONFIGURATION / INTENT SEPARATION

Explicitly separate:

```text
Platform Capability
```

from:

```text
Configuration
```

from:

```text
Policy
```

from:

```text
Intent
```

from:

```text
Current Runtime State
```

from:

```text
Resource Availability
```

These concepts must not collapse into one uncontrolled configuration object.

---

# 88. VERSIONED CONTRACTS

All important cross-package contracts require:

- stable owner
- schema
- semantic meaning
- versioning
- compatibility strategy
- migration strategy
- validation

Do not permit structurally similar contracts to diverge indefinitely.

---

# 89. CONTRACT OWNERSHIP

Every canonical contract must have an explicit owner.

Examples:

```text
Resource Contract
Runtime Contract
Plan Contract
Decision Contract
Intent Contract
Verification Contract
Policy Contract
Capability Contract
Event Contract
Telemetry Contract
```

Avoid cross-package ownership ambiguity.

---

# 90. CROSS-PLATFORM CLIENT MODEL

Keep OS-specific implementation behind stable contracts.

Platform capability discovery should be explicit.

Examples:

```text
Linux
- routes
- DNS
- interfaces
- tunnels
- process/network integration

macOS
- NetworkExtension
- system networking APIs

iOS
- Packet Tunnel
- NetworkExtension

Windows
- native networking APIs

Android
- VPN/connectivity APIs
```

Do not pretend unsupported functionality exists.

Use capability negotiation.

---

# 91. MOBILE / DESKTOP / OS CLIENT AUDIT

Audit all clients for:

- stale contracts
- dead interfaces
- unsupported operations
- duplicate authority
- platform leaks
- invalid assumptions
- missing runtime integration

Every client must explicitly connect to canonical runtime semantics.

---

# 92. RUNTIME ENTRYPOINT AUDIT

For every major runtime:

```text
Where does it start?
Who starts it?
What initializes?
What services register?
What event loop exists?
What owns mutations?
What owns shutdown?
What happens during crash?
What happens during restart?
```

Do not infer runtime semantics from directory names.

---

# 93. RESILIENCE RUNTIME AS CANONICAL AUTHORITY

`@irp/resilience-runtime` must not merely be another package.

Either:

1. it is the canonical runtime authority,

or

2. it is explicitly part of a clearly defined kernel/control architecture whose ownership is unambiguous.

No historical autonomous controller may silently compete with it.

---

# 94. LEGACY AUTHORITY ELIMINATION

Audit historical systems such as:

```text
NetworkAutopilot
```

and related execution paths.

Determine:

```text
Who owns decisions?
Who owns mutations?
Who owns policy?
Who owns safety?
Who owns recovery?
Who owns verification?
```

Migrate consumers.

Migrate tests.

Migrate runtime paths.

Migrate telemetry.

Deprecate duplicate authority.

Prove the old system is no longer production-critical.

Do not blindly delete useful logic.

---

# 95. ORPHAN DETECTION

Search for:

- exported but unused APIs
- unused packages
- unreachable services
- unregistered plugins
- unconsumed events
- never-emitted events
- unexecuted policies
- unused telemetry
- unreachable runtime components
- adapters with no consumers
- persistence models with no lifecycle
- capabilities with no executor
- executors with no authority
- test-only implementations pretending to be production implementations
- documentation-only architecture

Classify:

```text
CONNECTED
PARTIAL
ORPHANED
DUPLICATED
LEGACY
MISSING
```

---

# 96. DEAD PATH DETECTION

Trace:

```text
Application Entry
→ Runtime
→ Intent
→ State
→ Intelligence
→ Decision
→ Policy
→ Safety
→ Plan
→ Scheduler
→ Executor
→ Data Plane
→ Verification
→ Recovery
```

Also:

```text
OS Client
→ Platform Contract
→ Runtime
→ Authority
→ Privileged Adapter
→ OS
```

Anything unreachable must be investigated.

---

# 97. TELEMETRY INTEGRATION AUDIT

For every autonomous capability determine:

```text
What happened?
Why?
Under which intent?
With which evidence?
Using which strategy?
Under which policy?
With which safety state?
What changed?
What was verified?
What was the outcome?
What was learned?
```

Telemetry is operational infrastructure.

It is not decoration.

---

# 98. API SURFACE AUDIT

For each endpoint record:

```text
purpose
authority
input schema
output schema
validation
authentication
authorization
runtime consumer
side effects
telemetry
tests
failure behavior
```

Remove accidental duplicate mutation surfaces.

---

# 99. CLI SURFACE AUDIT

For each command determine:

```text
contract
authority
side effects
policy path
safety path
telemetry
tests
```

No CLI command may implement a hidden alternate version of network orchestration.

---

# 100. DEPLOYMENT AUDIT

Inspect and exercise:

```text
Dockerfiles
docker-compose
Kubernetes
CI/CD
release builds
desktop packaging
mobile builds
Linux packages
web deployments
runtime environment
health checks
readiness
startup
shutdown
migrations
upgrade/downgrade behavior
```

Fix real failures.

Do not remove failing services to make deployment appear healthy.

---

# 101. PNPM ONLY

Use:

```text
pnpm
```

as the canonical package-manager workflow.

Do not introduce `npm` as an alternative canonical workflow.

---

# 102. TOOLCHAIN CONSISTENCY

Audit and reconcile:

```text
Node
pnpm
Turbo
TypeScript
Vitest
ESLint
Prisma
workspace configuration
lockfile
CI versions
Docker toolchain
deployment runtime
```

No contradictory version assumptions.

---

# 103. CI/CD BASELINE

Required baseline:

```text
pnpm clean
pnpm validate
pnpm validate:docs
pnpm typecheck
pnpm lint
pnpm test
```

plus all relevant:

- package tests
- integration tests
- runtime tests
- security tests
- architecture tests
- deployment tests
- client tests
- system scenarios
- performance tests
- compatibility checks

No silently skipped critical path.

---

# 104. DIGITAL TWIN / SIMULATION

Extend the runtime lab into a serious simulation and replay platform.

It should support:

- interface failures
- provider failures
- gateway failures
- DNS failures
- route corruption
- tunnel failures
- destination restrictions
- latency degradation
- packet loss
- jitter
- provider switching
- remote node disappearance
- stale decisions
- race conditions
- policy changes
- rollback failures
- recovery failures
- federation loss
- resource churn
- capability changes

Support:

```text
what-if planning
strategy comparison
deterministic replay
incident replay
predictive validation
```

---

# 105. DETERMINISTIC REPLAY

A replay should reproduce, where possible:

```text
initial state
scenario
events
measurements
constraints
resource availability
decisions
random seed
verification
outcomes
```

Replays must help investigate real incidents.

---

# 106. REAL INCIDENT MODEL

A scenario should include:

```text
Scenario ID
Initial State
Resources
Capabilities
Intent
Policy
Events
Measurements
Failure Injection
Expected Diagnosis
Expected Candidate Set
Expected Safety Result
Verification Criteria
Expected Recovery
Expected Learning
```

---

# 107. TESTING PYRAMID

Implement multiple levels.

## Unit

Pure logic.

## Contract

Cross-package contracts.

## Integration

Real package boundaries.

## Runtime

Actual runtime execution.

## System

Full control-loop path.

## Failure Injection

Controlled failure.

## Recovery

Rollback and alternate strategies.

## Security

Authorization, capability, trust, sandbox.

## Performance

Latency and resource budgets.

## Compatibility

Schema/API/client compatibility.

## Deployment

Build/start/readiness/runtime.

No category may silently disappear because it is inconvenient.

---

# 108. GOLDEN END-TO-END SCENARIOS

At minimum validate:

## Healthy Internet

```text
healthy
→ low observation cost
→ no unnecessary mutation
```

## DNS degradation

```text
DNS degradation
→ diagnosis
→ alternate resolver
→ destination verification
→ learning
```

## Provider degradation

```text
provider degradation
→ correlation
→ alternate path
→ controlled switch
→ verification
→ rollback if needed
```

## Gateway failure

```text
gateway failure
→ alternate gateway
→ verification
```

## Tunnel failure

```text
tunnel failure
→ diagnosis
→ recovery
→ alternate strategy
```

## Restricted destination

```text
destination-specific failure
→ path reasoning
→ candidate generation
→ policy/security/safety
→ execution
→ destination-specific verification
```

## Prediction

```text
degradation trend
→ prediction
→ pre-staging
→ controlled switch
→ verification
```

## Federation loss

```text
remote unavailable
→ local autonomy continues
```

## Concurrent Decisions

```text
two plans race
→ stale protection
→ one canonical commit
```

## Verification Failure

```text
apply succeeds
→ outcome fails
→ rollback
→ verify rollback
→ next safe strategy
```

---

# 109. ARCHITECTURAL INVARIANTS

Create automated architecture checks.

At minimum:

1. Only canonical runtime authority can mutate privileged network state.
2. AI cannot directly execute privileged operations.
3. API cannot bypass safety.
4. CLI cannot bypass safety.
5. Desktop cannot bypass safety.
6. Mobile cannot bypass safety.
7. Plugins cannot bypass capability checks.
8. Remote nodes cannot become uncontrolled authorities.
9. Legacy autonomous authorities cannot remain active in production.
10. Critical decisions are observable.
11. Critical mutations are verifiable.
12. Failed mutations have recovery semantics.
13. Intent can reach executable planning.
14. Resources have canonical ownership.
15. Architecture duplicates are detected.
16. State versions prevent stale overwrites.
17. Exclusive resources require reservations where applicable.
18. Security failures fail closed where required.
19. Federation failure does not disable local control.
20. Optional AI failure does not disable deterministic control.

These checks should fail CI when architectural regressions appear.

---

# 110. ARCHITECTURAL DRIFT REGISTER

Maintain a machine-readable and human-readable drift register.

Track:

```text
missing integration
duplicate
orphan
dead path
incorrect ownership
unsafe
non-recoverable
non-observable
performance
security
coupling
compatibility
operability
```

Every issue requires:

```text
severity
evidence
impact
owner
resolution
verification
```

Do not track architecture drift only in prose.

---

# 111. PHASE TREE AUDIT

Audit every available phase document:

```text
docs/phases/phase-00.md
...
docs/phases/phase-78.md
```

Also inspect any later documents.

For each phase extract:

```text
objective
capabilities
architecture
source files
packages
entrypoints
tests
runtime consumers
current owner
runtime path
status
```

Classify:

```text
CONNECTED
PARTIALLY_CONNECTED
ORPHANED
DUPLICATED
LEGACY
MISSING
```

---

# 112. CAPABILITY MATRIX

Generate/maintain:

| Capability | Implementation | Owner | Input | Output | Consumer | Runtime Path | Failure Domain | Recovery | Security Boundary | Telemetry | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

Every important capability must appear.

No important capability may silently remain an orphan.

---

# 113. ARCHITECTURE MAPS

Maintain:

```text
docs/architecture/system-integration-map.json
docs/architecture/runtime-execution-graph.json
docs/architecture/failure-recovery-graph.json
docs/architecture/security-boundary-graph.json
```

These are evidence-backed architecture artifacts.

They are not substitutes for runtime truth.

After implementation:

```text
re-audit
→ regenerate
→ compare
→ verify
```

---

# 114. RUNTIME EXECUTION GRAPH

The runtime execution graph must answer:

```text
What starts?
What calls what?
What produces state?
What consumes state?
Who decides?
Who mutates?
Who verifies?
Who recovers?
```

No graph node should be treated as authoritative merely because it exists in JSON.

---

# 115. FAILURE / RECOVERY GRAPH

The recovery graph must show:

```text
Failure
→ Detection
→ Classification
→ Diagnosis
→ Candidate Elimination
→ Alternative Selection
→ Transaction
→ Verification
→ Rollback
→ Recovery
→ Learning
```

---

# 116. SECURITY BOUNDARY GRAPH

Document:

```text
trust zones
privileged zones
untrusted components
plugin zones
AI boundaries
remote-node boundaries
telemetry boundaries
secret boundaries
OS boundaries
user boundaries
```

Any privileged edge must be explicit.

---

# 117. PERFORMANCE MODEL

Establish measurable budgets for:

```text
healthy CPU overhead
healthy memory overhead
observation latency
decision latency
planning latency
recovery latency
event throughput
queue depth
startup time
shutdown time
```

Measure before optimizing.

---

# 118. RESOURCE BUDGETS

Define safe resource boundaries for:

```text
CPU
memory
threads/workers
queue size
event rate
telemetry volume
probe rate
database writes
remote requests
plugin execution
AI requests
```

Prevent runaway autonomy.

---

# 119. BACKPRESSURE

Every asynchronous pipeline must define:

```text
queue capacity
priority
backpressure
drop policy
retry policy
dead-letter semantics
shutdown behavior
```

Avoid unbounded queues.

---

# 120. EXTERNAL DEPENDENCY ISOLATION

Optional dependencies should not become critical-path dependencies unless explicitly required.

Critical recovery should not require:

```text
remote AI
analytics database
optional UI
federation
optional telemetry infrastructure
```

unless the architecture explicitly declares that dependency as critical and has a safe fallback.

---

# 121. REPRODUCIBILITY

Important decisions and failures should have:

```text
decision ID
transaction ID
scenario ID
seed
input state
evidence snapshot
resource versions
policy version
configuration version
```

so behavior can be reconstructed.

---

# 122. CONFIGURATION / POLICY VERSIONING

Policy and critical configuration should be versioned.

A decision must be traceable to:

```text
which policy version
which configuration version
which resource state
which evidence snapshot
```

produced it.

---

# 123. POLICY SAFETY

Policy evaluation must be deterministic enough to reproduce important decisions.

Policy should expose:

```text
allowed
denied
restricted
requires approval
```

plus explanation.

---

# 124. RESOURCE FAILURE ISOLATION

One broken resource must not destabilize the entire control plane.

Examples:

```text
broken gateway adapter
→ gateway isolated

broken plugin
→ plugin isolated

broken remote node
→ remote node isolated

broken provider integration
→ provider quarantined
```

---

# 125. SELF-HEALING BOUNDARIES

Self-healing must itself be bounded.

Avoid infinite loops such as:

```text
restart
→ fail
→ restart
→ fail
```

Use:

```text
failure counters
backoff
circuit breaker
quarantine
maximum attempts
health recovery criteria
```

---

# 126. SECURITY BLAST-RADIUS CONTROL

Privileged operations should be scoped to the minimum required:

```text
resource
action
duration
context
capability
```

A component should not receive broad privileges merely because one operation requires elevated access.

---

# 127. DATA CLASSIFICATION

Classify information at least conceptually as:

```text
PUBLIC
INTERNAL
SENSITIVE
SECRET
```

Apply appropriate rules to:

- logs
- telemetry
- persistence
- federation
- AI context
- plugins
- debug tools
- crash reports

---

# 128. OBSERVABILITY OF SECURITY

Security decisions should be traceable:

```text
request
→ identity
→ capability
→ policy
→ trust
→ decision
→ result
```

but without leaking secrets.

---

# 129. COMPATIBILITY

Cross-package and cross-client changes must consider:

```text
backward compatibility
forward compatibility
schema evolution
version negotiation
migration
rolling upgrades
```

Do not casually break canonical contracts.

---

# 130. STARTUP / SHUTDOWN SEMANTICS

Every major runtime must define:

```text
startup order
dependency initialization
degraded startup
readiness
liveness
graceful shutdown
forced shutdown
state persistence
lease release
transaction cleanup
```

---

# 131. HEALTH ENDPOINTS

Health endpoints must distinguish:

```text
process alive
runtime initialized
control plane ready
network control available
critical dependencies available
optional dependencies available
```

Do not return "healthy" merely because a process listens on a port.

---

# 132. DEPLOYMENT READINESS

Deployment validation should exercise:

```text
image build
container startup
configuration loading
dependency initialization
readiness
actual runtime path
health
shutdown
restart
```

---

# 133. DATABASE FAILURE SEMANTICS

Test:

```text
database unavailable
database timeout
connection reset
migration failure
partial write
stale schema
```

The system should degrade safely.

---

# 134. TELEMETRY FAILURE SEMANTICS

Test:

```text
collector unavailable
export timeout
queue saturation
serialization failure
telemetry misconfiguration
```

Critical control should remain safe.

---

# 135. FEDERATION FAILURE SEMANTICS

Test:

```text
remote timeout
remote authentication failure
remote stale evidence
remote malicious/invalid data
remote unavailable
```

The local system must preserve control integrity.

---

# 136. PLUGIN FAILURE SEMANTICS

Test:

```text
plugin crash
plugin timeout
plugin malformed result
plugin permission violation
plugin resource exhaustion
```

A plugin failure must not compromise the core runtime.

---

# 137. AI FAILURE SEMANTICS

Test:

```text
AI unavailable
AI timeout
AI malformed output
AI hallucinated resource
AI unsafe recommendation
AI contradictory recommendation
```

The platform must fall back to safe deterministic behavior.

---

# 138. NETWORK STATE MACHINE

Where appropriate, model controlled state transitions.

Do not allow arbitrary transitions such as:

```text
FAILED → COMMITTED
```

without a valid recovery path.

State transitions must be validated.

---

# 139. GENERATION / EPOCH MODEL

Use state generations or epochs where needed to prevent:

```text
late events
stale plans
old telemetry
duplicate operations
```

from corrupting current state.

---

# 140. EVENT ORDERING

Where ordering matters:

```text
event version
sequence
generation
timestamp
causality metadata
```

must be considered.

Do not rely solely on wall-clock timestamps for causality.

---

# 141. CONTROL-PLANE CONSISTENCY

Define which state requires:

```text
strong consistency
eventual consistency
best-effort freshness
```

Do not accidentally use eventual state for safety-critical decisions without compensating controls.

---

# 142. NETWORK POLICY SEMANTICS

Policies may define:

```text
allowed resources
allowed paths
forbidden destinations
trust requirements
required encryption
acceptable providers
acceptable failure domains
required verification
maximum risk
```

Policy must be enforceable at runtime.

---

# 143. USER OVERRIDE SEMANTICS

User overrides must be:

```text
explicit
scoped
versioned
time-bounded
auditable
safe
```

A manual override should not permanently destroy autonomous recovery semantics.

---

# 144. AUTONOMY / HUMAN CONTROL BALANCE

Automation should maximize usefulness without bypassing safety.

Normal operation:

```text
system acts automatically
```

Exceptional conditions:

```text
system asks for approval where policy requires
```

Expert cockpit:

```text
inspect + override through canonical authority
```

---

# 145. TESTABLE ARCHITECTURE

Every important architectural claim should map to one or more:

```text
unit test
integration test
architecture test
runtime test
failure scenario
deployment check
```

A claim with no evidence should be treated as unverified.

---

# 146. DOCUMENTATION INTEGRITY

Documentation must distinguish:

```text
implemented
partially implemented
simulated
planned
externally blocked
deprecated
```

Never document future architecture as production reality.

---

# 147. NO ARTIFICIAL PHASES

Do not invent:

```text
Phase 79
Phase 80
Phase 81
...
```

merely to defer architectural gaps.

This mission is cross-cutting.

Phase documents may be updated to reflect actual reality.

Do not use phase numbering as an escape hatch.

---

# 148. NO FUTURE-WORK CHEATING

Statements such as:

```text
will be implemented later
future phase
placeholder for optimizer
AI coming next
fabric abstraction coming later
simulation planned
```

do not count as completion where this mission requires the capability.

Either:

1. implement it,

or:

2. identify a genuine external blocker and implement the strongest possible local architecture and verification boundary.

---

# 149. VALID EXTERNAL BLOCKERS

Examples:

- unavailable Apple signing credentials
- unavailable physical device
- unavailable third-party provider
- unavailable production remote node
- unavailable external service credentials
- unsupported host capability

Even when blocked:

- implement local contracts
- implement adapters
- implement simulation
- implement deterministic tests
- implement failure handling
- implement telemetry
- document the exact blocker
- do not fake success

---

# 150. QUALITY BAR

Every change should consider:

```text
correctness
security
performance
observability
recovery
compatibility
maintainability
testability
operability
upgradeability
```

A feature is not complete until these dimensions are considered.

---

# 151. REPOSITORY ARCHAEOLOGY PROCEDURE

Do not start by writing code.

Start with archaeology.

## Step A — Inventory

Inspect:

```text
packages
apps
clients
infra
ops
config
docs
scripts
tools
CI
deployment
tests
entrypoints
generated artifacts
```

## Step B — Source Graph

Map:

```text
imports
exports
dependencies
registrations
adapters
consumers
```

## Step C — Runtime Tracing

Trace actual startup and execution.

## Step D — Capability Graph

Map major capabilities.

## Step E — Authority Map

Identify every decision-maker and mutation-capable component.

## Step F — Gap Matrix

Compare actual vs target.

## Step G — Canonical Contracts

Reconcile duplicate contracts.

## Step H — Implementation

Implement missing integrations.

## Step I — Tests

Add real verification.

## Step J — Runtime Scenarios

Exercise real control loops.

## Step K — Security / Performance

Run relevant gates.

## Step L — Deployment

Build and exercise deployments.

## Step M — Final Audit

Re-audit from scratch.

---

# 152. CAPABILITY COMPLETENESS

For each major capability answer:

```text
Can it be invoked?
Who owns it?
Who consumes it?
What runtime path reaches it?
What state does it mutate?
How is it secured?
How is it observed?
How is failure handled?
How is success verified?
How is its outcome learned?
```

Anything that cannot answer these questions is incomplete.

---

# 153. ARCHITECTURE RECONSTRUCTION METHOD

Do not reconstruct architecture from filenames alone.

Use evidence from:

```text
imports
exports
constructors
factory functions
dependency injection
registries
event subscriptions
entrypoints
service startup
runtime registration
tests
CLI calls
API handlers
platform adapters
deployment configuration
```

---

# 154. PRODUCTION PATH VS TEST PATH

Explicitly distinguish:

```text
production path
test-only path
simulation path
mock path
development path
```

Do not mistake simulation or mocks for production integration.

---

# 155. MOCK BOUNDARIES

Mocks are acceptable for:

```text
unit isolation
external dependency simulation
deterministic testing
failure injection
```

Mocks are not acceptable as proof of actual runtime integration.

---

# 156. CONTRACT TESTING

Where multiple implementations satisfy one contract, create shared contract tests.

Examples:

```text
DNS provider contract
Gateway provider contract
Tunnel provider contract
Platform adapter contract
Resource discovery contract
Execution contract
Verifier contract
```

---

# 157. ADAPTER MODEL

Adapters may translate between:

```text
canonical IRP contracts
```

and:

```text
OS-specific / provider-specific APIs
```

Adapters must not become hidden control authorities.

---

# 158. PLATFORM ABSTRACTION QUALITY

A platform abstraction is complete only when:

```text
capability known
implementation known
support limitations known
failure semantics known
runtime registration known
telemetry known
tests known
```

---

# 159. PERFORMANCE SAFETY

Do not trade correctness for performance without evidence.

Optimization should preserve:

```text
security
recoverability
observability
verification
```

---

# 160. RESOURCE LEAK PREVENTION

Check for:

- unreleased leases
- orphaned child processes
- unclosed sockets
- abandoned timers
- event listeners
- stale reservations
- unbounded caches
- unbounded queues
- leaked temporary files
- forgotten subscriptions

---

# 161. SHUTDOWN SAFETY

On shutdown:

```text
stop new plans
cancel safe operations
release resources
flush critical state
persist required recovery information
close workers
close sockets
close DB connections
emit final telemetry where possible
```

---

# 162. CRASH RECOVERY

After process restart, determine:

```text
Was a transaction in progress?
Were resources reserved?
Was state committed?
Was rollback partially complete?
Is a recovery action required?
```

Do not assume every crash implies clean state.

---

# 163. TRANSACTION JOURNAL

Where necessary, maintain durable transaction intent or recovery metadata for critical mutations.

The objective is:

```text
crash
→ restart
→ reconstruct transaction state
→ recover safely
```

without corrupting network state.

---

# 164. ROLLBACK CORRECTNESS

Rollback itself must be verified.

Do not consider:

```text
rollback command returned success
```

sufficient.

Verify:

```text
expected prior network state restored
```

or:

```text
safe compensating state achieved
```

---

# 165. PARTIAL FAILURE

The system must handle:

```text
Action A succeeds
Action B succeeds
Action C fails
```

without assuming all-or-nothing OS-level atomicity.

Use:

```text
compensation
rollback
state reconciliation
```

where appropriate.

---

# 166. RECONCILIATION LOOP

The runtime should be capable of:

```text
desired state
vs
observed state
```

and detect divergence.

This enables:

```text
drift detection
safe reconciliation
```

without blindly reapplying commands.

---

# 167. DESIRED STATE VS ACTUAL STATE

Separate:

```text
desired state
```

from:

```text
observed state
```

and:

```text
committed state
```

A command being issued does not make desired state actual state.

---

# 168. POLICY-AWARE RECONCILIATION

Reconciliation must pass through:

```text
policy
security
safety
```

Do not automatically reconcile into a state that is no longer allowed.

---

# 169. DYNAMIC DESTINATION KNOWLEDGE

Destination behavior may vary by:

```text
provider
path
transport
region
resolver
time
protocol
```

Model destination reachability contextually.

Avoid binary global destination labels when richer evidence exists.

---

# 170. TIME-AWARE NETWORKING

Where relevant, model:

```text
time of day
historical windows
temporary events
trend periods
expiration
```

Do not assume a network condition is stationary.

---

# 171. TOPOLOGY CHANGE HANDLING

When resources change:

```text
interface appears
interface disappears
gateway changes
route changes
provider changes
tunnel changes
remote node changes
```

the knowledge graph and scheduler must converge to current reality.

---

# 172. RESOURCE LIFECYCLE

A resource should have lifecycle semantics:

```text
DISCOVER
→ REGISTER
→ AVAILABLE
→ ACTIVE
→ DEGRADED
→ DRAIN
→ UNAVAILABLE
→ REMOVE
```

Where appropriate.

---

# 173. QUARANTINE

Failed or suspicious resources should support quarantine.

Quarantine must define:

```text
trigger
scope
duration
recovery criteria
re-entry
telemetry
```

---

# 174. HEALTH PROBING

Probes should be:

```text
purpose-specific
bounded
adaptive
cancellable
privacy-aware
```

Do not generate unnecessary traffic.

---

# 175. ACTIVE VS PASSIVE MEASUREMENT

Use both where appropriate:

```text
passive signals
+
active probes
```

Do not assume active measurement is always safe or cheap.

---

# 176. MEASUREMENT QUALITY

Measurements should record:

```text
timestamp
source
duration
sample size
confidence
method
scope
```

---

# 177. STRATEGY OUTCOME MODEL

Every strategy outcome should capture:

```text
strategy ID
intent
resources
evidence
policy
execution
verification
latency
performance
failure mode
rollback
final result
```

This becomes learning material.

---

# 178. LEARNING SAFETY

Learning updates should not immediately create unrestricted behavior changes.

Use:

```text
bounded updates
confidence thresholds
versioned learning
rollback
guardrails
```

---

# 179. MODEL / RULE VERSIONING

Where learning or statistical models affect decisions, version them.

Record:

```text
model version
feature assumptions
training/evaluation provenance where relevant
decision impact
```

---

# 180. NO BLACK-BOX AUTHORITY

Critical decisions must be reconstructable even if intelligence contains complex statistical or AI logic.

There must always be a deterministic boundary:

```text
recommendation
→ validation
→ policy
→ security
→ safety
→ execution
```

---

# 181. INCIDENT RECONSTRUCTION

An operator should be able to take:

```text
incident ID
```

and reconstruct:

```text
what the system believed
what evidence it had
what decision it made
why it made it
what changed
what happened
how it recovered
what it learned
```

---

# 182. EXPERT DEBUGGING

Provide sufficient introspection to answer:

```text
Why is this path active?
Why is this resource unhealthy?
Why was this strategy rejected?
Which policy blocked it?
Which safety rule blocked it?
Why was another provider preferred?
What changed since last stable state?
```

---

# 183. SECURITY AUDITABILITY

Audit privileged actions with:

```text
actor
identity
capability
policy
resource
action
timestamp
result
transaction
```

Do not expose secrets in the audit record.

---

# 184. CONTROL-LOOP DEADLOCK PREVENTION

Ensure that:

```text
observation
→ decision
→ execution
→ verification
```

does not create circular dependencies that prevent recovery.

Example:

```text
network recovery
must not depend on the telemetry system
which depends on the broken network path
```

unless an alternate route exists.

---

# 185. BOOTSTRAP DEPENDENCY RULE

Critical bootstrap services must not depend on capabilities that themselves require the runtime to already be fully operational.

Avoid circular startup.

---

# 186. MINIMUM VIABLE LOCAL CORE

Even under severe degradation, the core should retain:

```text
state
observation
basic diagnosis
policy
safety
safe execution
verification
recovery
```

Optional intelligence should enhance this, not replace it.

---

# 187. SECURITY DEFAULTS

Defaults must favor:

```text
least privilege
deny unsafe actions
minimal exposure
minimal secret access
bounded resource access
secure transport
explicit trust
```

---

# 188. PRIVILEGE ESCALATION

Privileged OS operations must be:

```text
explicit
scoped
authorized
audited
observable
recoverable
```

---

# 189. CHILD PROCESS SECURITY

If subprocess execution is required:

- use structured arguments
- avoid shell interpolation
- restrict environment
- restrict working directory
- validate commands
- enforce timeouts
- capture safe output
- classify errors
- audit execution
- minimize privileges

Never allow arbitrary AI-generated shell execution.

---

# 190. FILESYSTEM SECURITY

Components must not receive broad filesystem access unless required.

AI, plugins, and remote nodes must have especially constrained access.

---

# 191. NETWORK SECURITY

Protect control traffic through appropriate:

```text
authentication
authorization
integrity
encryption
replay protection
```

where applicable.

---

# 192. REMOTE EXECUTION BOUNDARY

Remote-node operations must remain bounded by local authority.

A remote node should not be able to say:

```text
do anything on the local machine
```

Merely because it is trusted.

---

# 193. CLIENT TRUST

Desktop/mobile/CLI clients should authenticate to the runtime where required and should not rely on implicit trust simply because they are local processes.

---

# 194. OPERATOR EXPERIENCE

The expert operator should see the system as:

```text
intent
→ current state
→ current decision
→ current plan
→ current action
→ verification
→ outcome
```

not as hundreds of unrelated package controls.

---

# 195. DO NOT EXPOSE INTERNAL COMPLEXITY TO NORMAL USERS

The platform should internally support enormous complexity while presenting normal users with:

```text
desired outcome
status
confidence
exceptions
```

Manual networking should remain a fallback, not the primary model.

---

# 196. DOCUMENTATION STRUCTURE

Maintain clear documentation for:

```text
system architecture
runtime architecture
resource model
intent model
security model
failure model
policy model
plugin model
federation
deployment
operations
testing
incident replay
```

Documentation must be generated from real architecture where practical.

---

# 197. AUTOMATED ARCHITECTURE VALIDATION

Implement scripts/tests capable of detecting:

```text
duplicate runtime authorities
direct privileged mutations
AI bypasses
plugin bypasses
API bypasses
missing verification
missing telemetry
missing recovery
orphaned capabilities
unreachable runtime components
duplicate contracts
```

---

# 198. BUILD / TYPE / LINT INTEGRITY

Do not solve type/lint problems through blanket weakening.

Fix:

```text
actual type semantics
ownership
imports
contracts
configuration
```

instead.

---

# 199. TEST FAILURE INTEGRITY

When a test fails:

1. identify the actual behavioral contract
2. determine whether implementation or test is wrong
3. verify against architecture
4. make the smallest correct change
5. add regression coverage

Never simply change expected output to get green.

---

# 200. DEPLOYMENT FAILURE INTEGRITY

If deployment fails:

```text
reproduce
→ diagnose
→ identify root cause
→ fix
→ rerun
```

Do not:

```text
remove service
→ skip health check
→ ignore failure
```

---

# 201. FINAL ACCEPTANCE TEST

At the end, ask the repository:

### Can a user express:

```text
"I need stable access to destination X with low latency."
```

Can IRP:

```text
understand intent
→ normalize intent
→ derive constraints
→ inspect resources
→ inspect topology
→ inspect failure domains
→ inspect capabilities
→ evaluate current state
→ generate strategies
→ score strategies
→ apply policy
→ apply security
→ apply safety
→ reserve resources
→ produce a plan
→ execute transactionally
→ observe actual outcome
→ verify result
→ commit success
```

or:

```text
rollback
→ verify rollback
→ recover
→ select next strategy
→ execute
→ verify
```

then:

```text
record outcome
→ update knowledge
→ update failure memory
→ improve future decisions
→ continue observation
```

without the human manually orchestrating the entire process?

If the answer is no:

> **The Superplatform is not complete.**

---

# 202. SYSTEM-WIDE DEFINITION OF DONE

The repository is complete only when:

```text
architecture is coherent
+
runtime is connected
+
control authority is canonical
+
critical capabilities are consumed
+
resource ownership is explicit
+
security boundaries are enforced
+
AI is bounded
+
plugins are bounded
+
mutations are transactional
+
stale decisions are rejected
+
concurrency is controlled
+
outcomes are verified
+
rollback is real
+
recovery is real
+
learning is wired
+
knowledge decay exists
+
evidence is traceable
+
clients consume canonical contracts
+
deployment works
+
tests provide real evidence
+
architecture invariants are automated
+
architecture drift is re-audited
```

---

# 203. NO EARLY STOPPING

Do not stop because:

- most packages compile
- unit tests pass
- CI is green
- documentation is complete
- architecture diagrams exist
- one runtime scenario works
- one client builds
- one path works
- one provider works
- one platform works

Completion requires system-level evidence.

---

# 204. FINAL REPOSITORY AUDIT

At the end perform another full repository audit from scratch.

Do not rely solely on the original audit.

Re-check:

```text
source
imports
exports
runtime
tests
deployment
documentation
authority
contracts
telemetry
security
recovery
clients
plugins
federation
CI
```

---

# 205. FINAL CHANGE AUDIT

Explicitly determine:

```text
WHAT WAS ALREADY PRESENT
→
WHAT WAS MISSING
→
WHAT WAS CONNECTED
→
WHAT WAS RECONCILED
→
WHAT WAS REPLACED
→
WHAT WAS DEPRECATED
→
WHAT WAS REMOVED AS DUPLICATE
→
WHAT WAS VERIFIED
→
WHAT REMAINS PARTIAL
→
WHAT REMAINS ORPHANED
→
WHAT REMAINS BLOCKED BY A REAL EXTERNAL DEPENDENCY
```

No ambiguity.

---

# 206. REQUIRED FINAL REPORT

Produce a final report containing:

```text
Executive Summary

Target Architecture

Actual Architecture

Architecture Delta

Canonical Authorities

Runtime Control Flow

Intent Compilation Flow

Resource Fabric

Capability Model

Knowledge Plane

Evidence Model

Strategy / Optimization Model

Scheduler

Transaction Model

Verification Model

Rollback / Recovery Model

Learning Model

Failure Domain Model

Security Model

AI Safety Boundary

Plugin Safety Boundary

Federation Model

Cross-Platform Model

Observability Model

Performance Characteristics

Deployment Status

CI Status

Testing Evidence

Golden Scenario Results

Architecture Invariants

Capability Matrix

Architecture Drift Register

Legacy Authorities Removed

Orphaned Capabilities

Remaining Gaps

External Blockers

Known Risks

Recommended Next Actions
```

---

# 207. QUALITY EVIDENCE REQUIREMENT

Every major completion claim should point to evidence such as:

```text
source path
test
runtime scenario
integration path
deployment result
architecture check
telemetry evidence
```

Do not state:

```text
implemented
```

without evidence.

---

# 208. GIT / DELIVERY

If repository write/push capability exists:

1. create a clean working branch
2. inspect current branch state
3. preserve unrelated user changes
4. implement changes
5. run validation
6. commit meaningful units
7. push
8. inspect the resulting diff
9. verify CI
10. inspect CI failures
11. fix genuine failures
12. rerun
13. ensure final repository state is coherent

Do not create superficial commits.

Do not create "green" commits that hide failures.

---

# 209. CHANGE HYGIENE

Avoid:

- giant unrelated rewrites
- accidental deletion of working code
- cosmetic refactors mixed with architectural fixes
- silent contract changes
- unnecessary dependency churn

Changes should be explainable by the architecture mission.

---

# 210. PRESERVE GOOD WORK

Do not rewrite healthy architecture simply because it is not aesthetically perfect.

Preserve functionality unless:

```text
duplicate authority
security issue
incorrect ownership
architectural contradiction
broken runtime behavior
maintainability failure
```

requires change.

---

# 211. REPLACEMENT PROCEDURE

When replacing an old subsystem:

```text
identify consumers
→ define canonical replacement
→ migrate consumers
→ migrate tests
→ migrate runtime registration
→ migrate telemetry
→ validate behavior
→ remove/deprecate duplicate authority
→ prove runtime no longer depends on old system
```

---

# 212. REPOSITORY COMPLETENESS STANDARD

The final repository must not merely contain:

```text
many packages
many interfaces
many tests
many docs
many phases
many abstractions
```

It must contain:

```text
one coherent system
```

whose components participate in a real autonomous runtime.

---

# 213. FINAL ARCHITECTURAL MODEL

The final architecture should conceptually converge toward:

```text
                    ┌───────────────────────────────┐
                    │      USER / APPLICATION       │
                    │   WORKLOAD / SERVICE INTENT   │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │       INTENT COMPILER         │
                    │ constraints + objectives      │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │         POLICY ENGINE         │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
            ┌─────────────────────────────────────────────────┐
            │             INTELLIGENCE / KNOWLEDGE            │
            │ observations / history / topology / federation │
            │ correlation / prediction / optimization / AI   │
            └─────────────────────┬───────────────────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────────┐
                    │      RESOURCE FABRIC MODEL    │
                    │ topology / capabilities /     │
                    │ failure domains / trust       │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    STRATEGY GENERATOR         │
                    │    + MULTI-OBJECTIVE          │
                    │      OPTIMIZER                │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │       PLAN / SCHEDULER        │
                    │ reservations / concurrency    │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │ SECURITY / AUTHORIZATION /     │
                    │       SAFETY KERNEL            │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     TRANSACTION EXECUTOR      │
                    │ prepare / apply / compensate   │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │          DATA PLANE            │
                    │ actual network connectivity    │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │         VERIFICATION          │
                    │ destination / service /       │
                    │ workload / security outcome   │
                    └───────────────┬───────────────┘
                                    │
                         ┌──────────┴───────────┐
                         │                      │
                      SUCCESS                FAILURE
                         │                      │
                         ▼                      ▼
                      COMMIT                ROLLBACK
                         │                      │
                         ▼                      ▼
                      LEARN                 VERIFY
                         │                      │
                         │                      ▼
                         │                   RECOVER
                         │                      │
                         │                      ▼
                         │             QUARANTINE / REPLAN
                         │                      │
                         └──────────┬───────────┘
                                    ▼
                               KNOWLEDGE UPDATE
                                    │
                                    ▼
                                 OBSERVE
```

---

# 214. ULTIMATE SUCCESS CONDITION

The final product should behave like:

> **An autonomous, adaptive, distributed, security-bounded Network Operating System that converts heterogeneous connectivity resources into a programmable fabric and continuously optimizes real network outcomes for users, applications, services, and workloads.**

The user experience should be:

```text
minimal manual networking
+
high reachability
+
high reliability
+
high performance
+
automatic recovery
+
adaptive optimization
+
strong security boundaries
+
explainable autonomy
```

while the internal platform performs:

```text
observe
measure
normalize
understand
correlate
diagnose
predict
reason
generate
optimize
decide
plan
reserve
authorize
secure
execute
verify
commit
rollback
recover
learn
update knowledge
repeat
```

---

# 215. ABSOLUTE FINAL RULE

Never confuse:

```text
"The architecture describes a Superplatform."
```

with:

```text
"The repository IS a Superplatform."
```

Only the second statement qualifies as success.

The repository itself must demonstrate:

```text
real source integration
+
real runtime behavior
+
real canonical authority
+
real intent execution
+
real resource orchestration
+
real security boundaries
+
real policy enforcement
+
real safety enforcement
+
real transactional mutation
+
real outcome verification
+
real rollback
+
real recovery
+
real learning
+
real telemetry
+
real architecture invariants
+
real integration tests
+
real runtime scenarios
+
real deployment evidence
```

Do not claim perfection without evidence.

Do not leave known architectural contradictions unresolved.

Do not leave locally solvable gaps for a fictional future phase.

Do not hide incomplete architecture behind documentation.

Do not replace real execution with simulation when real execution is locally possible.

Do not replace real verification with command success.

Do not replace recovery with retry loops.

Do not replace canonical authority with multiple competing controllers.

Do not allow intelligence to become unrestricted privilege.

Do not allow plugins or clients to bypass platform security.

Do not let federation become a single point of failure.

Do not let the database become an accidental single point of control.

Do not let observability become a control-plane dependency.

Do not let architecture drift accumulate silently.

The final state must be:

```text
ONE PLATFORM
ONE AUTONOMOUS OPERATING MODEL
ONE CANONICAL CONTROL AUTHORITY
ONE COHERENT STATE MODEL
ONE PROGRAMMABLE CONNECTIVITY FABRIC
ONE KNOWLEDGE PLANE
ONE SECURITY MODEL
ONE SAFETY MODEL
ONE VERIFICATION MODEL
ONE RECOVERY MODEL
ONE LEARNING LOOP
```

And the final audit must explicitly prove:

```text
WHAT WAS THERE
→
WHAT WAS MISSING
→
WHAT WAS CONNECTED
→
WHAT WAS RECONCILED
→
WHAT WAS REPLACED
→
WHAT WAS DEPRECATED
→
WHAT WAS REMOVED AS DUPLICATE
→
WHAT WAS VERIFIED
→
WHAT REMAINS PARTIAL
→
WHAT REMAINS ORPHANED
→
WHAT STILL HAS A GENUINE EXTERNAL BLOCKER
```

Do not stop until every locally solvable critical gap has been addressed.

**The objective is not to make the repository look like a Superplatform.**

**The objective is to make the repository actually behave like one.**
