# ADR-0003: Phase 6 Network Intelligence Core

## Status

Accepted

## Context

The platform needs reliable network quality data before any autonomous resilience decisions can be introduced.

## Decision

Implement a plugin-based TypeScript probe engine and monitoring service in `@irp/network`, expose read and manual-trigger endpoints through the API, add a developer CLI check command, persist future production data through Prisma network models, and export Prometheus/OpenTelemetry-compatible telemetry.

## Consequences

Network measurements are modular, testable, and reusable by future routing or switching logic. The current phase intentionally avoids modifying user traffic and keeps automated remediation out of scope.
