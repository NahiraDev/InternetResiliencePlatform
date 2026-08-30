# Phase 60 — Administration & Self-Hosting

## Status

**Started on `phase/60-administration-self-hosting`.**

## Objective

Turn the unified control plane into an operator-manageable, self-hostable deployment without moving safety-critical network decision authority into the administration layer.

## Scope

- self-hosted control-plane deployment contract;
- explicit environment/configuration schema and safe configuration inspection;
- database migration lifecycle and startup/readiness policy;
- operator backup and restore workflows with validation;
- administrative API for read-only system configuration/status and controlled maintenance operations;
- deterministic operator tooling suitable for CI and local deployments;
- auditability for administrative actions;
- failure-safe behavior: configuration validation must fail closed, migrations must be explicit, and restore operations must not silently overwrite active state;
- production verification for container/runtime, database, backup and restore paths.

## Non-goals

- no routing, DNS, gateway, tunnel or failover authority in the administration layer;
- no automatic destructive migration or implicit database reset;
- no plaintext secret persistence in backups or logs;
- no bypass of existing authentication/RBAC/audit contracts;
- no modification of trusted-source artifact workflow semantics from the CI baseline.

## Acceptance criteria

1. A self-hosted deployment has a deterministic configuration contract and startup validation.
2. Database migration status is inspectable and migrations are executed through an explicit operator-controlled path.
3. Backup output is deterministic, integrity-checkable and excludes configured secret material.
4. Restore performs preflight validation and refuses unsafe overwrite conditions.
5. Administrative operations require authenticated/RBAC-authorized principals and emit audit events.
6. Health/readiness distinguishes application health from database migration readiness.
7. Operator tooling has deterministic success/failure exit codes and bounded output.
8. Unit, integration and failure-path tests cover invalid configuration, migration drift, backup integrity, restore refusal and authorization failures.
9. `pnpm validate`, `pnpm typecheck`, `pnpm lint`, relevant tests and `pnpm build` pass.
10. CI/runtime evidence verifies the self-hosted control-plane path before Phase 60 is marked complete.

## Architectural constraints

The administration layer is an operator/control-plane concern. It may inspect and maintain platform state, but it must not directly decide or mutate routing, DNS, tunnel or gateway state. Such changes remain behind the existing policy/safety-controlled domain services.

## Initial implementation sequence

1. Establish configuration and deployment contracts.
2. Add migration-status and maintenance primitives.
3. Add backup/restore service contracts with integrity verification.
4. Expose authenticated operator endpoints.
5. Add operator CLI commands and deterministic CI checks.
6. Add runtime/integration verification and close the phase only after all gates are green.
