# Phase 28 Production Runtime Verification

Phase 28 turns the Docker runtime into an operational-readiness gate. The production stack is expected to build, start, initialize PostgreSQL, apply idempotent migrations, become ready, serve traffic, report health, restart, recover from a PostgreSQL restart, and shut down cleanly.

## Runtime architecture

- `compose.yaml` starts PostgreSQL first and gates the API on the PostgreSQL health check with `condition: service_healthy`.
- The API image runs as the non-root `irp` user (`uid=1001`, `gid=1001`) and is launched by `dumb-init`.
- `scripts/runtime-entrypoint.mjs` is the production startup coordinator. It validates required runtime configuration, verifies writable runtime paths, waits for database connectivity, runs `pnpm --filter @irp/database prisma:migrate:deploy`, starts Fastify, and logs lifecycle transitions.
- Production migrations use Prisma `migrate deploy`; destructive reset commands are not part of startup.

## Required production configuration

The production API container requires:

- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET`
- `API_HOST` / `API_PORT` when overriding `config/production.yaml`
- Optional database wait tuning: `DATABASE_READY_TIMEOUT_MS`, `DATABASE_READY_INTERVAL_MS`

Do not log `DATABASE_URL`, `JWT_SECRET`, or other secrets. Startup diagnostics name missing variables without printing their values.

## Health surfaces

- `GET /api/v1/live` is liveness: the Fastify process is alive.
- `GET /api/v1/ready` is readiness: the API and queue are usable and PostgreSQL answers `SELECT 1`; database failure returns HTTP 503.
- `GET /api/v1/platform/status` includes `dependencies.database` and `dependencies.queue` so operational dashboards can distinguish network status from runtime dependencies.
- `GET /api/v1/metrics` exposes the existing Prometheus metrics surface.

## Runtime filesystem contract

The production compose service uses a read-only root filesystem. The only writable API paths are intentional tmpfs mounts:

- `/tmp`
- `/app/tmp`
- `/app/.cache/node/corepack/v1`
- `/app/.local/share/pnpm`

This protects the Phase 27 Corepack/pnpm regression path (`/app/.cache/node/corepack/v1`) while avoiding broad writable application directories or `chmod 777` workarounds.

## Verification

Run the full local verification pipeline:

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
bash scripts/docker-smoke.sh
git status --short
```

The Docker smoke script performs a clean compose rebuild and volume initialization, checks live/ready/platform/metrics endpoints, verifies the API runs as non-root, verifies Corepack/pnpm writable paths, checks logs for Corepack EACCES and obvious secret names, restarts the API, restarts PostgreSQL, restarts the full stack, and verifies graceful shutdown logs.

## Troubleshooting

- Missing `DATABASE_URL` or `JWT_SECRET`: the entrypoint fails fast before migrations or HTTP listen.
- PostgreSQL unavailable: startup waits up to `DATABASE_READY_TIMEOUT_MS`; readiness returns HTTP 503 if PostgreSQL is lost after startup.
- Corepack/pnpm permission failures: verify `/app/.cache/node/corepack/v1` and `/app/.local/share/pnpm` are writable by `irp` and mounted as tmpfs in compose.
- Migration failures: inspect API logs; startup exits non-zero and does not silently continue.
