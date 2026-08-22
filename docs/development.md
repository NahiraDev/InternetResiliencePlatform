# Development Guide

This guide is for developers working directly in the repository.

## Requirements

- Node.js 24 or newer
- pnpm 11.21 or newer
- Git
- Docker Engine + Docker Compose for containerized development/runtime checks

The repository uses pnpm workspaces and Turborepo. Use `pnpm` for project workflows.

## Install

```bash
corepack enable
pnpm install
```

## Standard verification

```bash
pnpm validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run the smallest relevant package-level checks while developing, then run the repository gates before completing a change.

## Workspace development

Use workspace filters for package-specific work:

```bash
pnpm --filter @irp/<package> <command>
```

Avoid installing dependencies separately inside workspace packages.

## API development

The API is implemented under `apps/api`. Use the repository's workspace scripts and environment configuration rather than inventing package-local runtime conventions.

## Docker

See [Docker operations](operations/docker.md) for production-like container verification.

## Documentation

When behavior, architecture, configuration, or an external contract changes, update the corresponding canonical document. Do not create a phase report as a substitute for product documentation.

## Change checklist

1. Identify the affected package/application and architecture boundary.
2. Update implementation and tests together.
3. Run relevant focused checks.
4. Run repository validation/typecheck/lint/test/build as applicable.
5. Update canonical documentation.
6. Confirm no secrets or sensitive operational data entered logs, tests, fixtures, or documentation.
