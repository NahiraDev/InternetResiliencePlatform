# Quick Start

## Prerequisites

- Git
- Node.js 24 or newer
- pnpm 11.21 or newer
- Docker for containerized services/runtime

## Install

```bash
pnpm install
```

## Validate the repository

```bash
pnpm validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Run locally

Use the repository scripts and package-level commands documented in [`development.md`](../development.md). Runtime services that require PostgreSQL should use the supported Docker/database setup.

## Next steps

- [Configuration](../configuration.md)
- [Architecture overview](../architecture/overview.md)
- [API overview](../api/overview.md)
- [Testing](../guides/testing.md)
- [Troubleshooting](../guides/troubleshooting.md)

## Important

IRP is under active development. Verify capability status in `PROJECT_STATE.md` before assuming a subsystem is production-ready.
