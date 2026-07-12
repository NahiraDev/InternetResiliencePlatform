# Architecture

InternetResiliencePlatform is a pnpm/TurboRepo monorepo targeting Node.js 22 LTS. The foundation separates runnable applications from reusable packages so future DNS resilience features can be added without coupling UI, daemon, and API concerns.

## Applications

- `apps/cli`: Commander-based operator CLI with placeholder commands for version, diagnostics, status, configuration, and benchmarking.
- `apps/daemon`: background service skeleton responsible for configuration loading, lifecycle management, scheduling hooks, health monitoring hooks, and plugin initialization.
- `apps/api`: Fastify REST API exposing `/health`, `/version`, and `/status`.

## Packages

- `@irp/core`: dependency injection container, application lifecycle, plugin contract, and composition primitives.
- `@irp/config`: YAML and environment configuration loader with validation and hot-reload extension point.
- `@irp/logger`: structured JSON logging with console and file transports.
- `@irp/network`: network interface discovery, connectivity monitor placeholder, IP capability detection, and latency helpers.
- `@irp/dns`: resolver, provider, health check, and benchmark interfaces.
- `@irp/telemetry`: metrics registry, health status aggregation, and performance counter foundation.
- `@irp/types`: shared platform types.
- `@irp/utils`: small shared utility helpers.

## Decisions

- Strict TypeScript is enabled across all workspaces.
- Runtime packages expose ESM modules.
- Product behavior remains skeletal in Phase 1; DNS switching and production scheduling are deferred.
