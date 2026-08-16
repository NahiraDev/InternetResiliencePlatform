# Docker Development and Production Runtime

## Architecture

The repository has one Docker architecture for the pnpm/Turbo monorepo:

- `Dockerfile` builds the production API image with dependency, build, and runtime stages.
- `Dockerfile.dev` provides a development container with workspace dependencies available from the mounted source tree.
- `compose.yaml` runs the production-equivalent API plus PostgreSQL.
- `compose.dev.yaml` runs the same API architecture in a development workflow.
- PostgreSQL is addressed from containers as `postgres:5432` through `DATABASE_URL`.
- The Prisma schema is validated during image build and migrations are applied with `prisma migrate deploy` during container startup.

## Development

Start the development environment:

```bash
docker compose -f compose.dev.yaml up --build
```

Check container status and logs:

```bash
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml logs api postgres
```

The API is exposed at `http://localhost:8080`. Liveness, readiness, metrics, and runtime APIs are available under `/api/v1/live`, `/api/v1/ready`, `/api/v1/metrics`, and `/api/v1/runtime/*`.

## Production-equivalent local runtime

Build the image:

```bash
docker build .
```

Run the production-equivalent Compose stack:

```bash
docker compose up --build
```

Use a real secret outside local development:

```bash
JWT_SECRET='replace-with-a-strong-secret-at-runtime' docker compose up --build
```

## Database and Prisma

Apply migrations manually when needed:

```bash
pnpm --filter @irp/database prisma:migrate:deploy
```

Reset a local development database only when data loss is acceptable:

```bash
docker compose -f compose.dev.yaml down -v
```

Prisma `db push` is not used as a production migration strategy. Containers use the checked-in Prisma migrations in `packages/database/prisma/migrations`.

## Troubleshooting

- Docker build failure: run `docker compose config` first, then rebuild with `docker build .` to isolate build errors.
- pnpm workspace failure: verify `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and package manifests are present and run `pnpm install --frozen-lockfile`.
- Prisma generation failure: run `pnpm --filter @irp/database prisma:generate` and verify `DATABASE_URL` is set for migration commands.
- Database readiness failure: inspect `docker compose logs postgres` and confirm `pg_isready` reports healthy.
- Stale volumes: run `docker compose down -v` or `docker compose -f compose.dev.yaml down -v` for local-only resets.
- Port conflicts: change host mappings for `8080` or `5432` if another local service is using them.
- Application health failure: inspect `docker compose logs api`, then check `curl -f http://localhost:8080/api/v1/ready`.
