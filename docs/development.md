# Development

## Requirements

- Node.js 24
- pnpm 11
- Git
- Docker Engine + Docker Compose for containerized development

The repository is a pnpm workspace. Use `pnpm`; do not substitute npm commands in project workflows.

## Install

```bash
corepack enable
pnpm install
```

## Verify the repository

Run the normal quality gates before submitting changes:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm validate
```

## Run the API locally

```bash
pnpm --filter @irp/api start
```

For package-specific work, use the workspace filter rather than installing dependencies inside individual packages.

## Docker

Container development and the production-style runtime are documented in [development/docker.md](development/docker.md).

## Configuration

Runtime configuration is documented in [configuration.md](configuration.md). Do not copy historical phase configuration examples from `docs/phases/` into new deployments.

## Before opening a change

1. Keep changes scoped to the relevant package or application.
2. Add or update tests for behavior changes.
3. Run the affected package tests and the repository validation gates.
4. Update canonical documentation only when the externally observable behavior or supported architecture changes.
