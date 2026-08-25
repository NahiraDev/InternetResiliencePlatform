# IRP Runtime Lab

The Runtime Lab is an isolated, repeatable environment for verifying that IRP packages execute together at runtime rather than only passing build/typecheck.

## What it verifies

The lab periodically executes two real package paths from the repository:

1. `@irp/gateway-registry` — evaluates and selects a gateway from live-style health evidence.
2. `@irp/resilience-runtime` — runs the existing Phase 40 end-to-end validation harness, including observation, decision, execution, verification, and recovery scenarios.

The lab records package-call counters, runtime outcomes, gateway selection metrics, structured JSON logs, and OTLP traces. The traces are sent directly to Tempo using the standard OTLP/HTTP JSON format.

## Start

From the repository root:

```bash
pnpm runtime:lab
```

Or:

```bash
docker compose -f ops/observability/docker-compose.yml up
```

## Endpoints

| Component | URL |
|---|---|
| Runtime Lab | http://localhost:8080 |
| Runtime report | http://localhost:8080/report |
| Runtime metrics | http://localhost:9464/metrics |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| Tempo | http://localhost:3200 |

Grafana is provisioned automatically with Prometheus and Tempo and loads the **IRP Runtime Lab** dashboard.

## Reading the result

The dashboard exposes:

- runtime lab health
- number of runtime cycles
- gateway selections and selected score
- package interaction rate (`runtime-lab -> gateway-registry`, `runtime-lab -> resilience-runtime`)
- runtime cycle duration
- scenario pass/fail status
- gateway selection success

Open Grafana's Explore view and use the Tempo datasource to inspect individual traces. A trace contains a root `irp.runtime.cycle` span and child spans for gateway selection and resilience-runtime validation.

## Important limitation

This is intentionally a **runtime verification harness**, not a claim that every IRP package is currently wired together. It only reports interactions that the harness actually executes. The next stage should instrument the production runtime entry points and replace synthetic boundaries with the real runtime dependency edges.

The lab is therefore useful for answering two separate questions:

- **Does the existing runtime path execute successfully?**
- **Which package boundaries are actually exercised by that path?**

It does not infer unused package relationships from the monorepo dependency graph.
