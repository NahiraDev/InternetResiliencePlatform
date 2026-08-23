# Phase 44 — Data Analytics & Decision Intelligence

## Status

**Implementation present; final CI/runtime verification gate required before completion.**

## Objective

Turn accumulated network, telemetry, historical-analysis, and distributed-probe evidence into a bounded analytics layer that produces trustworthy summaries, trends, anomaly signals, and decision-support data without becoming an independent network mutation engine.

## Scope

- bounded time-window analytics over historical measurements and signed regional probe evidence;
- availability, latency, jitter, packet-loss, DNS/TCP/TLS/HTTP health where source data exists;
- p50/p95/p99 and explicit insufficient-data semantics;
- region/probe/destination/service dimensions supported by the evidence model;
- deterministic bounded anomaly detection;
- analytics contracts consumable by Desktop and the future Full Mobile Client;
- deterministic JSON/CSV export;
- input/data-quality validation, stale-data handling, bounded queries, and privacy-safe metadata.

## Non-goals

- autonomous routing changes based solely on analytics;
- unbounded machine learning or opaque model dependencies;
- collection of sensitive payload contents;
- replacement of existing historical-analysis or telemetry packages.

## Architectural boundary

```text
Measurements / Telemetry / Federation Evidence
                    |
                    v
             Analytics Engine
                    |
       +------------+-------------+
       |            |             |
   Aggregates     Trends       Anomalies
       |            |             |
       +------------+-------------+
                    |
              Analytics API
             /      |       \
        Desktop   Mobile    Core
```

Analytics is read-oriented decision support. It may feed Core decision/policy evaluation, but it does not directly apply routing, DNS, tunnel, or failover mutations.

## Acceptance criteria

1. Bounded time-range queries return deterministic summary statistics.
2. p50/p95/p99, availability, latency, and packet-loss calculations are correct and explicitly represent insufficient data.
3. Trends expose direction/change, sample count, and confidence rather than only a score.
4. Supported probe/region/destination/service dimensions can be grouped without conflating egress identity and destination identity.
5. Anomalies include metric, observed value, baseline/window, severity, confidence, and reason.
6. Invalid timestamps/ranges/measurements and oversized queries are rejected.
7. Missing or stale data is explicit and is never silently treated as healthy.
8. Shared typed analytics contracts are consumable by Desktop and Mobile subject to authorization/platform constraints.
9. JSON/CSV exports are deterministic and contain no secrets or raw payload data.
10. Tests cover normal, empty, sparse, outlier, boundary, and invalid-input cases.

## Security and privacy

- Telemetry and federation evidence are untrusted inputs.
- Analytics must not expose probe private keys, access tokens, credentials, raw request payloads, or unrelated metadata.
- Authorization is enforced at API boundaries.
- Query limits and aggregation windows remain bounded.
- Evidence-derived results preserve provenance.

## Verification

Required before completion:

```text
pnpm validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
CI green
```

Runtime evidence is required if final integration changes runtime behavior.

## Dependencies

Consumes historical/federated evidence from Phases 28–29 and 43. Feeds later decision intelligence and Phase 45 network identity/policy assurance.

## Definition of Done

Implementation, shared contracts, API integration, tests, documentation, changelog/state synchronization, and final CI/runtime evidence must agree. Source presence alone is not completion evidence.
