# Phase 30 — Production Security Hardening

## Current implementation

This phase is a security gate. No security alert is to be dismissed merely to make CodeQL green.

### Implemented in this branch

- Added an explicit API rate-limit security primitive at `apps/api/src/security/rate-limit.ts`.
- Added deterministic unit coverage at `apps/api/src/security/rate-limit.test.ts`.
- The primitive emits standard `RateLimit-*` headers and `Retry-After` on HTTP 429 responses.
- The implementation is deliberately isolated behind a small interface so the storage layer can be replaced by a shared Redis-backed store before horizontal production deployment.

## Required integration before merge

The API entrypoint must register the limiter and apply route-specific policies to at least:

- authentication/login
- registration
- refresh
- password reset
- network probes
- runtime cycle
- autopilot runs

Public health/readiness/metrics endpoints must receive an explicit policy decision rather than being accidentally exposed or accidentally blocked.

## Security blockers

- CodeQL #36 — privileged `workflow_run` checkout in Datadog workflow.
- CodeQL #37 — privileged `workflow_run` checkout in Docker Publish workflow.
- CodeQL #11–#33 — missing rate limiting in API handlers.

The privileged workflows must consume trusted artifacts from the originating CI run rather than checking out `github.event.workflow_run.head_sha` inside a privileged workflow.

## Production requirement

The in-memory limiter is a safe development/test fallback, not the final distributed production store. Before horizontal scaling, replace the storage implementation with a shared Redis-backed store while retaining the same policy and HTTP semantics.
