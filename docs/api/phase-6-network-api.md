# Phase 6 Network Intelligence API

All routes are versioned under `/api/v1`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health/network` | Returns current network intelligence snapshot with status, score, recent measurements, failures, and detected issues. |
| GET | `/metrics/network` | Returns aggregate network metrics summary. |
| GET | `/measurements` | Returns historical network measurements with pagination metadata. |
| POST | `/probes/run` | Manually runs all registered network probes and records telemetry. |

The endpoints return the standard success envelope used by earlier phases.
