# Package Reference

IRP is a workspace monorepo. Packages should expose narrow responsibilities and stable contracts.

## Core package groups

| Package | Responsibility |
| --- | --- |
| `@irp/auth` | Authentication, credentials, authorization primitives |
| `@irp/config` | Configuration loading and validation |
| `@irp/connectivity` | Connectivity abstractions and provider-facing behavior |
| `@irp/core` | Shared core/domain primitives |
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

## Dependency guidance

Prefer depending on the narrowest package that owns a contract. Avoid reaching into another package's private implementation directories.

When changing a public package contract:

1. update its tests;
2. update consumers;
3. update the relevant architecture/API documentation;
4. run repository validation and typecheck.
