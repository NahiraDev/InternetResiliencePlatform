# Phase 4 Development Guide

Use Node.js 22 LTS and pnpm 9. Install dependencies with `pnpm install`.

Common commands:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Configuration is loaded from `config/default.yaml` plus an environment overlay such as `config/development.yaml`, `config/staging.yaml`, or `config/production.yaml`. Runtime overrides use `IRP_*` environment variables.

Database development uses Prisma in `packages/database/prisma/schema.prisma`. Set `DATABASE_URL` to a PostgreSQL connection string before running Prisma migrations.
