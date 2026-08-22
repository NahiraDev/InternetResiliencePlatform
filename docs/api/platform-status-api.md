# Platform Status API

This document describes the currently supported platform status and live-metrics endpoints.

## Base path

All API routes are versioned under:

```text
/api/v1
```

## `GET /platform/status`

Returns the current platform/network observation snapshot using the standard API response envelope.

The response is derived from the network monitoring/runtime state. It may contain network health, DNS, routing, recovery, tunnel, security, decision, event, and observability information depending on what is implemented and available at runtime.

Unsupported capabilities are reported as unavailable or observe-only. The endpoint does not itself apply DNS, routing, tunnel, firewall, or recovery mutations.

## `GET /platform/metrics/stream`

Returns a Server-Sent Events stream with live network measurements.

The stream uses:

- `Content-Type: text/event-stream`;
- `Cache-Control: no-cache, no-transform`;
- `Connection: keep-alive`;
- `X-Accel-Buffering: no`.

Each `platform.metrics` event contains a JSON payload with the current source, update timestamp, and measurement records. Measurement records can include latency, success state, packet-loss percentage, and DNS performance when those values are available.

## Safety boundary

These endpoints are observation surfaces. Calling them must not be interpreted as permission to mutate host networking or execute recovery actions.

## Source of truth

The running API implementation and its tests are authoritative. This document intentionally avoids reproducing historical phase requirements or implementation notes so that it remains a stable API reference.
