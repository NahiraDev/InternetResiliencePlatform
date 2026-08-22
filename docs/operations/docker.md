# Docker Operations

IRP uses Docker for production-like runtime verification and supported containerized services.

## Runtime requirements

Production containers should run as non-root users where supported and must have explicit writable paths for required runtime state.

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

Do not solve runtime permission failures by switching the application to root. Identify the required writable path and grant the least privilege needed. This is especially important for package-manager/Corepack caches during startup.

## Debugging

Inspect the earliest startup error, container logs, effective user, mounted paths, environment, and health status. Keep credentials out of logs and diagnostics.
