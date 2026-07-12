# Development

## Requirements

- Node.js 22 LTS
- pnpm 9+
- Docker and Docker Compose for the optional development container

## Setup

```bash
corepack enable
pnpm install
```

## Commands

```bash
pnpm lint
pnpm build
pnpm test
pnpm --filter @irp/cli build
pnpm --filter @irp/api start
pnpm --filter @irp/daemon start
```

## Configuration

Base configuration lives in `config/default.yaml`, with environment overlays in `config/development.yaml` and `config/production.yaml`. Environment variables such as `IRP_API_HOST`, `IRP_API_PORT`, `IRP_LOG_LEVEL`, `IRP_LOG_FILE`, and `IRP_TELEMETRY_ENABLED` override file values.
