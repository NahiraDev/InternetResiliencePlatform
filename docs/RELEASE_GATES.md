# Release and Phase Gates

IRP is a safety-sensitive network platform. A green build alone is not a release.

## Every phase

Required before a phase is marked complete:

- implementation merged;
- unit/integration tests pass;
- `pnpm typecheck` passes;
- `pnpm lint` passes;
- `pnpm validate` passes;
- affected runtime smoke tests pass;
- canonical documentation is updated;
- security impact is reviewed;
- migration and rollback behavior are verified when state or network behavior changes.

## Network-control phases

For DNS, routing, tunnel, gateway, failover and policy changes additionally require:

- positive-path verification;
- failure-path verification;
- rollback verification;
- bounded retry/timeout behavior;
- no uncontrolled traffic redirection;
- telemetry proving the selected action and its outcome.

## Client phases

Desktop and mobile releases additionally require:

- supported OS/platform matrix;
- installation/upgrade/uninstall verification;
- offline and reconnect behavior;
- authentication/session recovery;
- secure storage validation;
- background lifecycle validation;
- network-extension/native adapter validation where applicable.

## Production certification — Phase 70

Phase 70 requires all previous phases to have evidence-backed completion, plus:

- reproducible builds;
- supply-chain/security checks;
- release artifact verification;
- upgrade and rollback test;
- observability and diagnostics;
- disaster/recovery procedure;
- documented support matrix;
- final end-to-end validation across supported clients and gateway roles.

## No silent exceptions

Known failures must be represented as explicit issues or documented exceptions with an owner and exit criterion. Tests must not be weakened with `--passWithNoTests`, disabled type checking, arbitrary skips, or hidden network-control fallbacks.
