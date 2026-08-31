# Package Reference

IRP is a workspace monorepo. Packages should expose narrow responsibilities and stable contracts.

## Core package groups

| Package | Responsibility |
| --- | --- |
| `@irp/auth` | Authentication, credentials, authorization primitives |
| `@irp/config` | Configuration loading and validation |
| `@irp/connectivity` | Connectivity abstractions and provider-facing behavior |
| `@irp/core` | Shared core/domain primitives, including the platform-neutral mobile client core |
| `@irp/database` | PostgreSQL/Prisma persistence boundary |
| `@irp/dns` | DNS domain and resolver-related functionality |
| `@irp/events` | Event contracts and event infrastructure |
| `@irp/failover` | Failover/recovery domain behavior |
| `@irp/kernel` | Kernel/platform integration boundary |
| `@irp/logger` | Structured logging |
| `@irp/metrics` | Metrics primitives and exposition |
| `@irp/network` | Network-level abstractions |
| `@irp/network-intelligence` | Network measurement and intelligence |
| `@irp/plugin-api` | Plugin-facing contracts |
| `@irp/plugin-config` | Plugin configuration |
| `@irp/resilience-runtime` | Resilience control-loop/runtime behavior |

The repository contains additional packages and applications. This page intentionally highlights architectural boundaries rather than duplicating the workspace manifest.

## Mobile client core

Phase 64 extends `@irp/core` with a platform-neutral `MobileClientCore` boundary. It owns client-local state, policy state representation, diagnostics adapter contracts and change events. It does **not** own routing, DNS, gateway, tunnel, failover or privileged networking mutations.

## iOS Full Client

Phase 65 adds the native iOS client boundary under `clients/ios`. It owns SwiftUI presentation, control-plane session lifecycle, Keychain-backed refresh-token storage, diagnostics/analytics presentation and explicit policy requests. It does **not** execute routing, DNS, gateway, tunnel, failover or other privileged networking mutations.

Native Network Extension behavior is intentionally deferred to Phase 66.

## Dependency guidance

Prefer depending on the narrowest package that owns a contract. Avoid reaching into another package's private implementation directories.

When changing a public package contract:

1. update its tests;
2. update consumers;
3. update the relevant architecture/API documentation;
4. run repository validation and typecheck.