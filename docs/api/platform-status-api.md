# Platform Status and Real-Time Metrics API

This document records the audited API contract used by the Electron desktop live mode and Phase 24 visualization clients.

## Historical requirement

Earlier stabilization phases introduced a consolidated live status endpoint for the Electron backend connector. Phase 24 added real-time visualization requirements for sampled latency, packet-loss, and DNS performance without mutating host DNS, routing, tunnels, or security state.

## Current implementation

All routes are mounted below `/api/v1` in `apps/api/src/index.ts`.

### `GET /platform/status`

Returns the standard success envelope with a `source: "LIVE"` data object derived from `NetworkMonitoringService` measurements. The response includes network, DNS, routing, recovery, tunnel, security, decision, event bus, and observability sections. Unsupported enforcement capabilities remain explicitly observe-only or unavailable rather than being represented as active host control.

### `GET /platform/metrics/stream`

Returns `text/event-stream` and emits a `platform.metrics` server-sent event. The event payload is a JSON object with:

- `source: "LIVE"`
- `updatedAt`, copied from the network health score timestamp
- `metrics[]`, one entry per current network measurement
- per-measurement `timestamp`, `probeType`, `latencyMs`, and `success`
- `packetLossPct` only when packet-loss probes report a numeric loss ratio
- `dnsPerformanceMs` only for DNS probe measurements

The endpoint sets `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no` so proxies and reverse proxies do not buffer visualization events. It also emits a conservative SSE `retry` hint for client reconnect behavior.

## Recovery work performed during this audit

The Phase 24 stream contract was hardened with explicit no-buffering/no-transform headers and a regression test that parses the SSE `data:` line rather than only checking for substrings. This verifies that visualization clients receive structured LIVE metrics and DNS performance fields.

## Security and runtime notes

The status and metrics endpoints are read-only observation surfaces. They run safe probes through the existing network monitoring service and do not apply routes, change DNS settings, open tunnels, modify firewall state, or execute recovery actions.
