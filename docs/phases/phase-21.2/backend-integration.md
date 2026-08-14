# Phase 21.2 Backend Integration

## Verified dependency flow

```text
HTTP client
  -> Fastify route in apps/api/src/index.ts
  -> NetworkMonitoringService from @irp/network
  -> default network probes
  -> measurement store and score calculation
  -> telemetry metric recording in @irp/telemetry
  -> JSON response and /api/v1/metrics exposure
```

## API and controllers

The API is implemented directly in `buildServer()` with Fastify routes. The health, readiness, metrics, network health, measurements, and probe execution routes are registered at startup.

## Services and core

The API instantiates `NetworkMonitoringService`, auth providers, RBAC, queue, database client, and `InMemoryEventBus`. Phase 21.2 repaired the network-health route so an empty monitor is initialized by running the existing probe service instead of returning an empty snapshot.

## Network intelligence

The live backend currently uses `@irp/network`, not `@irp/network-intelligence`. `@irp/network-intelligence` remains package-level and tested, but it is not the backend runtime provider.

## Event bus

The backend creates an `InMemoryEventBus` and publishes user registration events. This bus is in-process only; it is not connected to Electron.

## DNS, routing, recovery, AI, and tunnel

- DNS: ordinary DNS latency probing is reachable through `@irp/network` probes.
- Secure DNS: DoH/DoT implementation exists in `@irp/dns`, but no live backend route/service uses it.
- Routing: no backend runtime route application path was found.
- Recovery: monitor retry/failure tracking is live; full recovery orchestration is not wired.
- AI: deterministic decision package/demo data is not called by backend network health.
- Tunnel: no real tunnel provider is started by backend.
