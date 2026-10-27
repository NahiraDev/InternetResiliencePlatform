# Docker Operations

IRP uses Docker for production-like runtime verification and supported containerized services.

## Runtime requirements

Production containers should run as non-root users where supported and must have explicit writable paths for required runtime state.

The API runtime image does not include any package manager: pnpm is only present in build stages, and production startup runs entirely on Node.js plus the production dependency closure (the Prisma CLI is invoked directly, never through `pnpm run`/`pnpm exec`). The supported writable runtime paths are:

- `/app/tmp` — application temporary state.

The Compose deployment provides these paths as per-container `tmpfs` mounts while keeping the application root filesystem read-only.

## Smoke-test expectations

A production-like Docker verification should cover:

1. image build;
2. container startup;
3. database readiness;
4. application readiness;
5. health endpoint behavior;
6. representative API request;
7. restart/recovery behavior;
8. clean shutdown.

## Permissions

Do not solve runtime permission failures by switching the application to root. Identify the required writable path and grant the least privilege needed. Runtime writable paths must correspond to actual production dependencies; do not provision a writable Corepack cache when Corepack is not part of the startup path.

## Debugging

Inspect the earliest startup error, container logs, effective user, mounted paths, environment, and health status. Keep credentials out of logs and diagnostics.
