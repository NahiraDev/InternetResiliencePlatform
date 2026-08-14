# Phase 21.2 Secure DNS Status

**Classification: PARTIAL / DISCONNECTED**

Secure DNS is not absent: `@irp/dns` contains DoH and DoT transport implementation and package tests, and documentation describes secure DNS transport behavior. However, Phase 21.2 did not find or verify a live backend/core/Electron runtime registration that invokes those transports.

## Evidence

- Search found DoH/DoT implementation paths in `packages/dns/src/index.ts` and tests in `packages/dns/src/index.test.ts`.
- Backend network health uses `@irp/network` default DNS latency probing, not the secure DNS transport selector.
- Desktop IPC returns DEMO DNS status from demo data.

## Decision

Do not fake a provider and do not mark secure DNS runtime PASS. The correct next stabilization action is to wire the existing `@irp/dns` secure transport through an existing backend/core service path with safe timeout/failure/recovery tests.
