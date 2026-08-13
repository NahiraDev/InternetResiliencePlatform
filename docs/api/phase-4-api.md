# Phase 4 API Documentation

All production API routes are versioned under `/api/v1`.

| Method | Path                  | Description                                                       |
| ------ | --------------------- | ----------------------------------------------------------------- |
| GET    | `/api/v1/version`     | Returns application name, version, and environment.               |
| GET    | `/api/v1/health`      | Returns aggregate health state.                                   |
| GET    | `/api/v1/ready`       | Returns readiness state for serving traffic.                      |
| GET    | `/api/v1/live`        | Returns liveness state for process supervision.                   |
| GET    | `/api/v1/metrics`     | Returns Prometheus metrics.                                       |
| POST   | `/api/v1/events/test` | Publishes a typed internal test event for integration validation. |

Swagger UI is served from `/docs`.
