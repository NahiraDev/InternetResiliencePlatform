# Phase 32 — Endpoint Intelligence Registry & Distributed Measurement Foundation

## Objective

Create a deterministic foundation for maintaining thousands of public network endpoints and converting probe observations into comparable health and confidence scores.

This phase does **not** bypass access controls or implement censorship circumvention. It provides measurement, reliability analysis, endpoint lifecycle management, and data needed by later routing/failover components.

## Implemented

- Endpoint registry and health scoring module in `@irp/telemetry` (`src/endpoint-registry.ts`).
- Endpoint registry keyed by stable endpoint IDs.
- Endpoint metadata: address, hostname, protocol, port, region, provider, ASN, tags.
- Observation ingestion with validation.
- Bounded per-endpoint observation history.
- Availability, latency, packet-loss, reliability and confidence scoring.
- Lifecycle states: `new`, `probing`, `healthy`, `degraded`, `unreliable`, `retired`.
- Filtering by status, region and protocol.
- Deterministic endpoint ranking.
- Explicit retirement operation.
- Unit coverage for registration, aggregation, ranking, validation and scoring.

## Architecture boundary

The registry is intentionally storage-agnostic. It currently uses in-memory state so callers can later provide PostgreSQL/TimescaleDB, Redis, or another durable/distributed store without changing the scoring API.

The registry also does not perform network probes itself. Probe workers should remain separate so scheduling, concurrency, timeouts, privacy controls, and transport-specific implementations can evolve independently.

## Next integration work

1. Connect probe workers from `@irp/connectivity` to the registry.
2. Add durable persistence and retention policies.
3. Add distributed scheduler/sharding for large endpoint sets.
4. Add regional/provider/ASN diversity scoring.
5. Export endpoint health to telemetry and Prometheus.
6. Feed ranked healthy endpoints into the routing/failover policy layer.
7. Add freshness/expiry handling and anti-poisoning safeguards.

## Safety and operational requirements

- Do not treat a single probe as authoritative.
- Require multiple observations before high-confidence decisions.
- Preserve source and observation timestamps for auditability.
- Apply bounded retention to raw measurements.
- Avoid collecting unnecessary user-identifying data.
- Do not automatically act on untrusted endpoint metadata without validation.
