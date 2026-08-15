# Phase 21.4 Test Architecture

Phase 21.4 stops feature development and treats tests as regression controls, not green-build decoration.

## Test levels

- **Unit:** deterministic behavior inside one module, with no public internet or host mutation.
- **Integration:** safe wiring between existing packages, using loopback/local fakes where needed.
- **Contract:** API/schema/security boundary assertions such as platform status honesty and JWT fail-closed behavior.
- **E2E:** full supported runtime paths only when the environment can prove them; otherwise recorded as `NOT_TESTED`.
- **Runtime:** startup, initialization, live happy path, failure, recovery, and shutdown evidence.
- **Security:** fail-closed auth, Electron isolation, IPC allowlists, plugin permission checks, secret handling, DNS/TLS boundaries.
- **Regression:** every fixed defect gets a behavioral test that would have failed before the fix.
- **Failure:** timeouts, malformed data, unsupported provider behavior, cancellation, and degraded states.
- **Recovery:** bounded retry, clean shutdown, no retry storms, and failback where existing code supports it.
- **Property/Invariant:** stable invariants such as identifier boundaries, RBAC ordering, health aggregation priority, and queue size accounting.

## Cache policy

`pnpm test` is the normal developer gate. Fresh coverage evidence must use `pnpm exec turbo run test --force -- --coverage`; cached Turbo coverage is not acceptable as final evidence.

## Package policy

Runtime-capable packages must have meaningful behavioral tests. Pure type/SDK/configuration/example packages may rely on compile-time contract checks only when documented in the inventory and must not be silently hidden by `--passWithNoTests` in critical runtime packages.
