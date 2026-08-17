# Network Autopilot Runbook

## Enable or disable

Autopilot defaults to disabled observe-only. Enable only with explicit policy configuration and an allowlist of typed actions.

## Inspect

- CLI: `irp autopilot status`, `irp autopilot actions`, `irp autopilot policy`.
- API: `GET /api/v1/autopilot/status`, `/runs`, `/actions`, `/policies`, `/circuit-breaker`.

## Approve, reject, rollback

Use the authenticated API endpoints `/api/v1/autopilot/actions/:id/approve`, `/reject`, and `/rollback`. The local CLI intentionally does not bypass API authorization.

## Circuit breaker

If the breaker opens, autonomous consequential actions stop. Investigate recent run events, failed verification, rollback status, and dependency health before calling `POST /api/v1/autopilot/circuit-breaker/reset`.

## Crash recovery

Phase 26 records full run state in the runtime store abstraction and pre-action snapshots in action results. On restart, inspect unfinished `APPLYING`, `VERIFYING`, or `ROLLING_BACK` runs and prefer verification or rollback before new execution.

## Failed verification or rollback

Unknown or failed verification is never success. Prefer rollback where a pre-action snapshot exists; escalate if rollback cannot be proven safe.
