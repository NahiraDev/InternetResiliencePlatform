# IRP Architecture Overview

This diagram summarizes the architectural boundaries of InternetResiliencePlatform. The API and clients expose and consume capabilities, while `@irp/resilience-runtime` remains the authoritative control-loop orchestrator. Domain packages own their respective security, intelligence, gateway, tunnel, storage, and telemetry responsibilities.

```mermaid
flowchart TD
    subgraph surfaces[Product surfaces]
        Web[Web Control Center]
        Desktop[Desktop clients<br/>Linux · macOS · Windows]
        Mobile[Mobile clients<br/>iOS · Android]
        Operator[Operator / Scheduler]
    end

    subgraph control[Control plane]
        API[Fastify API<br/>authentication · authorization · app services]
        ClientAPI[Shared capability API / SDK]
    end

    subgraph runtime[Authoritative control loop · @irp/resilience-runtime]
        Observe[Observe + normalize evidence]
        Orchestrate[Correlate + orchestrate]
        Decide[Compose decision]
        Guard[Policy + capability + safety admission]
        Plan[Plan bounded action]
        Execute[Execute through adapters]
        Verify[Verify outcome]
        Recover[Recover / rollback]

        Observe --> Orchestrate --> Decide --> Guard --> Plan --> Execute --> Verify
        Verify -->|failure| Recover
        Recover --> Verify
    end

    subgraph domains[Domain capabilities]
        NI[@irp/network-intelligence<br/>measurements · models · scoring]
        Fabric[Connectivity / routing / DNS]
        Gateway[@irp/gateway-registry<br/>inventory · health · failover]
        Tunnel[@irp/tunnel<br/>provider lifecycle]
        Platform[Platform networking adapters]
    end

    subgraph records[State and evidence]
        Stores[Domain persistence / runtime state]
        Events[@irp/events<br/>shared event contracts]
        Telemetry[Telemetry · metrics · audit]
    end

    Web --> ClientAPI
    Desktop --> ClientAPI
    Mobile --> ClientAPI
    Operator --> API
    ClientAPI <--> API
    API --> Orchestrate

    Observe --> NI
    NI -->|decision inputs| Decide
    Plan --> Fabric
    Plan --> Gateway
    Gateway -->|eligible candidate| Tunnel
    Execute --> Tunnel
    Execute --> Platform
    Execute --> Fabric

    Observe --> Stores
    Verify --> Stores
    Orchestrate --> Events
    Verify --> Telemetry
    Recover --> Telemetry
    Stores --> API
    Telemetry --> API
```

## Boundary rules

- Clients own presentation and platform lifecycle integration; they do not own autonomous routing, policy, gateway selection, or failover decisions.
- Network intelligence supplies evidence and decision inputs. The resilience runtime owns control-loop orchestration and authoritative decision composition.
- Every network mutation passes policy, capability, and safety admission before execution, and its result is verified. Recovery/rollback is part of the same controlled lifecycle.
- `@irp/gateway-registry` owns gateway inventory, health, selection, multi-gateway failover, and fleet operations. `@irp/tunnel` owns tunnel contracts and provider lifecycle.
- Domain persistence and telemetry remain with their canonical owners; shared cross-package events use `@irp/events`.

See [Control-Plane Ownership](control-plane-ownership.md), [Data and Control Flow](data-flow.md), [System Architecture](system-architecture.md), and [Platform Model](platform-model.md) for the normative architecture details. `PROJECT_STATE.md`, tests, runtime evidence, and CI determine current implementation status; this diagram is an overview rather than a phase-completion claim.
