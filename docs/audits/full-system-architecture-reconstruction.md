# Full-System Architecture Reconstruction

**Baseline:** Phase 78 (Closed-Loop Control Foundation)
**Status:** evidence-based reconstruction; this report does not certify a release, a historical phase, or an unexecuted integration.

## Bounded scope

This reconstruction maps the implemented local control path and the package boundaries that feed it. It does not introduce a new phase, control plane, policy engine, state registry, event bus, or provider registry. It records unresolved integration work explicitly instead of presenting package presence as system behavior.

Machine-readable companion artifacts are the [system map](../architecture/system-integration-map.json), [runtime execution graph](../architecture/runtime-execution-graph.json), [failure/recovery graph](../architecture/failure-recovery-graph.json), and [security boundary graph](../architecture/security-boundary-graph.json). Their edges cite the source file establishing each relationship.

## Current architecture and canonical target

The canonical local authority is `@irp/resilience-runtime`. `ResilienceRuntime.cycle()` performs observation, incident correlation, decision orchestration, planning, policy admission, validation, transaction execution, verification, recovery, and decision/telemetry recording. The Phase 78 `BoundedClosedLoopController` only repeats that cycle under a hard bound; it does not reimplement a decision or mutation path.

The daemon is the implemented privileged local host: it constructs the runtime with Linux connectivity observation plus connectivity, routing, DNS, gateway, and tunnel ports. The API is a management/control surface and rejects live runtime cycles. DNS host mutation is therefore reached through the daemon adapter, not the API.

The intended autonomous-network model is only **partially** realized. The runtime has a connected local closed loop and adapters for DNS, connectivity/gateway, routing, tunnel, and failover. It does not yet establish a fully connected dynamic path graph spanning destination, provider, remote node, region, history, and federation in one production decision contract.

## Capability → implementation → owner → integration state

| Capability                                       | Current implementation                                                                             | Canonical owner                                                      | State                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Observation / local measurement                  | `ObservationAggregator`; daemon `LinuxObservationProvider`; network-intelligence monitor/providers | resilience-runtime observation boundary                              | CONNECTED for daemon connectivity observations; other providers are advisory inputs                               |
| Diagnosis / decision composition                 | `IncidentCorrelator`, `DecisionOrchestrator`, `CanonicalDecisionProvider`                          | resilience-runtime                                                   | CONNECTED                                                                                                         |
| Policy, capability and validation                | planner policy result, `RuntimeActionValidator`, safety kernel                                     | resilience-runtime with security contracts                           | CONNECTED in runtime; API authorization is a separate ingress guard                                               |
| Transaction, verification, rollback and recovery | `ActionTransactionEngine`, `RuntimeActionVerifier`, `FailoverRecoveryProvider`                     | resilience-runtime                                                   | CONNECTED; route rollback is not a documented compensator                                                         |
| DNS strategy                                     | daemon `IntelligentDnsEngine`; runtime canonical DNS port; `@irp/dns` catalog                      | daemon/runtime adapter boundary; DNS package owns catalog            | PARTIALLY CONNECTED: runtime needs a daemon-injected port; destination outcome verification is not yet explicit   |
| Connectivity, route and gateway selection        | `ConnectivityManager`, `RoutingEngine`, `GatewayRegistrySelectionPlane`                            | domain packages behind runtime adapter                               | CONNECTED for canonical adapter actions                                                                           |
| Tunnel lifecycle                                 | `TunnelRegistryControlPlane`, `@irp/tunnel`                                                        | tunnel package behind runtime adapter                                | CONNECTED at adapter contract; daemon defaults it off                                                             |
| Historical intelligence                          | `HistoricalAnalysisAdvisor`, `@irp/historical-analysis`, history API                               | historical-analysis advisory port → resilience-runtime ranking input | CONNECTED as an injected, read-only advisory input; history-store failure preserves local decisioning             |
| Federation / remote intelligence                 | probe federation contract/API                                                                      | resilience-runtime federation boundary                               | PARTIALLY CONNECTED: evidence transport exists but is not required by the local cycle                             |
| Telemetry / incidents                            | runtime stores/events/telemetry, telemetry package                                                 | runtime lifecycle telemetry + telemetry package                      | CONNECTED in-memory; external collector failure isolation lacks a closed-loop test                                |
| Database                                         | database package and API persistence                                                               | database package                                                     | PARTIALLY CONNECTED: canonical runtime cycle uses in-memory stores and does not depend on database                |
| Plugins                                          | plugin packages and daemon `PluginHost`                                                            | plugin runtime/manager                                               | PARTIALLY CONNECTED: plugin lifecycle is separate from mutation authority                                         |
| Clients / CLI / API                              | platform clients, CLI, API runtime routes                                                          | client/API surfaces                                                  | PARTIALLY CONNECTED: no client owns privileged decision logic, but endpoint-level compatibility autopilot remains |

The historical phase-to-code evidence is intentionally maintained in the [phase history evidence matrix](phase-history-evidence-matrix.md). That source already distinguishes historical labels from verified current-phase capability claims; this report does not falsely convert those labels into completion evidence.

## Actual local execution path

```text
daemon scheduler or API simulation request
  → ResilienceRuntime.cycle
  → observation aggregation
  → incident correlation
  → decision orchestration and planning
  → policy admission + validation + action lock
  → transaction engine → canonical network adapter
  → destination/domain verification
  → commit record OR failover/rollback recovery
  → decision, incident, event, and telemetry records
```

The closed-loop controller can invoke the same cycle repeatedly with unique correlation/idempotency suffixes, stops on blocked/failed/healthy outcomes as configured, and prevents a new cycle after cooperative abort. The deterministic integration test proves that it calls `ResilienceRuntime.cycle()` rather than a parallel loop.

## Control and data-plane boundaries

**Control plane:** the runtime owns lifecycle ordering and the contracts that constrain decisions. Network intelligence and internet intelligence supply inputs; they do not obtain a privileged adapter. Gateway, tunnel, connectivity, routing, DNS, and failover remain domain-specific data-plane/resource owners behind runtime adapter ports.

**Data plane:** the daemon injects the actual connectivity/routing/DNS/gateway/tunnel ports. The canonical adapter invokes only an action selected by the runtime plan. For live DNS, daemon code requires Linux, a discovered interface, known provider addresses, a bounded `resolvectl` call, and runtime validation before that call is reachable.

## Resilience, local-first operation, and performance

- A cycle creates in-memory decision/incident/event/telemetry objects and does not read the database, federation, or a central API before observation. Those outages therefore reduce optional capability rather than preventing a bounded local cycle.
- `ResilienceRuntime` permits one in-flight cycle and holds a validator lock for the plan dependency key, preventing concurrent conflicting changes within a runtime instance. Idempotency keys return the prior record.
- `BoundedClosedLoopController` defaults to one cycle and caps execution at ten, preventing uncontrolled retries. The daemon scheduler is separately configured with one concurrent cycle, cooldown, and execution budget.
- Verification is action-specific, but not uniformly destination-outcome-specific: connectivity verifies active-source health; routing verifies a selectable route; DNS verifies resolver-provider health; tunnel verifies the tunnel. This is a material gap for the product requirement that an action prove destination connectivity.

## Architectural drift register

| Severity | Type                                    | Evidence-based gap                                                                                                                                                                                                   | Affected components                                                               | Correction status                                                                                                                         |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | duplicate / incorrect ownership         | `NetworkAutopilot` retains a second state machine, diagnosis, policy evaluation, planning and action model, while API autopilot routes instantiate it separately from `ResilienceRuntime`.                           | `packages/resilience-runtime/src/autopilot/autopilot.ts`, `apps/api/src/index.ts` | **OPEN.** Migrate API compatibility views onto decision records/runtime contracts; do not expand this path with privileged mutation.      |
| MEDIUM   | historical-data scope                   | Historical analysis is now an explicit read-only decision input, but retained measurements are only scoped by candidate identifier or action intent; destination/provider/path-specific evidence remains incomplete. | historical-analysis, resilience-runtime                                           | **OPEN.** Extend the canonical path/destination resource model before adding broader historical selectors; retain hard policy precedence. |
| HIGH     | non-recoverable / verification gap      | Route mutation has no documented route-specific rollback in the canonical adapter, and several verifiers prove component health rather than destination outcome.                                                     | canonical network adapter, routing, recovery                                      | **OPEN.** Add pre-state snapshot/compensator and destination verification contract before broad live routing automation.                  |
| MEDIUM   | missing integration                     | Federation and remote-node evidence are present as contracts but not evidenced as a decision input to the local canonical cycle.                                                                                     | federation/API/runtime                                                            | **OPEN.** Normalize remote evidence as advisory observations; timeout/failure must preserve local operation.                              |
| MEDIUM   | non-observable                          | Runtime records local telemetry, but failure of an external telemetry sink is not covered by a closed-loop test.                                                                                                     | runtime/telemetry                                                                 | **OPEN.** Add a fault-injecting sink integration test proving recovery continues and records a local incident/event.                      |
| MEDIUM   | tight coupling                          | Daemon is the only evidence-backed live DNS host and is Linux-specific.                                                                                                                                              | daemon, DNS                                                                       | **OPEN.** Add platform-specific privileged adapters behind the same port; do not move mutation into clients/API.                          |
| LOW      | documentation only / stale coordination | `PROJECT_STATE.md` says Phase 78 is current while `.github/ACTIVE_WORK.md` still describes Phase 71 as the implementation gate.                                                                                      | project coordination                                                              | **OPEN.** Reconcile the two canonical coordination documents in a dedicated coordination change with release evidence.                    |

## Product-level evidence and limitations

The deterministic runtime E2E validation includes healthy, DNS degradation, provider recovery, and destination-specific scenarios; the Phase 78 integration test proves the bounded loop reaches the canonical runtime. The historical-advisory integration test proves retained DNS measurements enter canonical ranking while a history-store outage leaves the local decision path available. These are controlled tests, not evidence that all adapters execute on a real host or that remote/federated paths work in production.

Accordingly, the honest current description is: **a connected, bounded local resilience control foundation with several domain adapters, plus unresolved integration work to become one full autonomous network autopilot.** The system must not be marketed as a fully unified multi-path, destination-aware, historically informed, federated autopilot until the open high-severity corrections are implemented and validated.

## Evidence and handoff

**Objective:** reconstruct the implemented system around the Phase 78 local control loop without adding a new phase.

**Scope:** canonical ownership, actual source-level relationships, runtime/failure/security graphs, and documented drift.

**Implementation:** machine-readable graphs and this audit; no runtime authority was added.

**Tests:** the existing closed-loop integration test and runtime validation code are the direct behavioral evidence; fresh `pnpm` execution is blocked in this environment by Node 20 lacking `node:sqlite` required by pnpm 11.

**CI/runtime evidence:** requires a Node version supported by the pinned pnpm before certification.

**Known limitations:** all OPEN drift register rows remain open.
**Potential follow-up:** consolidate the legacy `NetworkAutopilot` API surface into canonical runtime decision records before adding any new path-selection behavior.
