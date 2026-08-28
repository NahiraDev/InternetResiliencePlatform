# Phase 52 — Automated Tunnel Lifecycle

## Status

**Implementation complete; CI/runtime verification in progress.**

Phase 52 extends the canonical `@irp/tunnel` domain with a provider-neutral automated lifecycle orchestrator. It does not create a second tunnel abstraction and does not bypass the Phase 45 policy/identity boundary or Phase 51 gateway-selection boundary.

## Implementation

- `packages/tunnel/src/lifecycle.ts`
- `packages/tunnel/src/lifecycle.test.ts`
- exported from `packages/tunnel/src/index.ts`

## Lifecycle contract

```text
configured
   ↓
preparing → kill-switch safety boundary
   ↓
connecting
   ↓
establishing
   ↓
health + route verification
   ↓
connected
```

Failure path:

```text
connect/health failure
        ↓
     failed
        ↓
   recovering
        ↓
    connecting
```

Terminal teardown:

```text
connected/degraded/failed → disconnecting → disconnected → destroyed
```

## Safety properties

- Provider, platform adapter and kill-switch responsibilities are explicit contracts.
- Provider protocol, scope, routing mode and declared capabilities are validated before establishment.
- Route context is validated before network establishment when the option is enabled.
- Full-tunnel/strict configurations require a configured kill-switch implementation before safety-critical mutation.
- Kill switch remains enabled while a new connection is being established and is disabled only after successful post-connect health verification.
- Health verification requires healthy status, connectivity, handshake and authentication evidence.
- Connect attempts are bounded to 1–10 and each attempt has an explicit timeout.
- Retry transitions obey the canonical tunnel state machine (`failed → recovering → connecting`).
- Concurrent operations on the same tunnel are rejected.
- Failed establishment performs provider/adapter cleanup and destroys the newly-created tunnel.
- Credential rotation changes references only; secret material never enters lifecycle telemetry.
- Endpoint/credential rotation is followed by a verified reconnect.
- Shutdown is sequential and attempts to clean up every active tunnel.
- Lifecycle events are tagged with `phase: 52`.

## Tests

`lifecycle.test.ts` covers:

1. successful establish with safety lock and post-connect verification;
2. bounded transient retry through the state machine;
3. health-verification failure with kill switch retained;
4. rejection when a required safety mechanism is unavailable;
5. endpoint/credential rotation through reconnect;
6. concurrency rejection and destroy cleanup.

## Workflow audit performed with Phase 52

The existing Runtime Lab and Public Runtime Lab workflows had a material verification gap:

1. neither workflow was triggered by changes under `packages/tunnel/**`;
2. main-branch concurrency used `cancel-in-progress: true`, so a long-running runtime verification could be silently cancelled by a newer push;
3. readiness was treated as sufficient evidence even when a container could become ready and then restart immediately, which is consistent with the historical connection-reset failure mode.

The workflows were corrected to:

- include `packages/tunnel/**` in relevant path filters;
- cancel obsolete PR runtime runs but never cancel main-branch runtime evidence;
- perform a post-readiness stability window and assert unchanged container restart counts;
- retain detailed runtime diagnostics on failure.

These workflow changes are part of Phase 52's acceptance evidence because lifecycle changes are network/runtime behavior, not TypeScript-only changes.

## Acceptance criteria

- [x] Provider-neutral lifecycle orchestration exists in the canonical tunnel package.
- [x] Establish/connect/disconnect/reconnect/rotate/destroy operations are bounded and observable.
- [x] Health and route verification gates successful establishment.
- [x] Kill-switch safety boundary is explicit.
- [x] Retry and failure transitions obey the state machine.
- [x] Concurrency is guarded.
- [x] Unit tests cover normal, boundary, failure and safety paths.
- [x] Runtime workflow triggers include the tunnel package.
- [x] Runtime workflow cancellation semantics no longer discard main-branch evidence.
- [x] Runtime workflows detect post-readiness crash/restart races.
- [ ] Repository CI is green for the final Phase 52 commit.
- [ ] Runtime Lab is green for the final Phase 52 commit.
- [ ] Public Runtime Lab completes its required verification window for the final Phase 52 commit.

## Explicit non-goals

- multi-gateway failover and candidate switching policy (Phase 53);
- gateway fleet provisioning/maintenance (Phase 54);
- gateway security/compliance hardening (Phase 55);
- client-specific system networking implementations;
- automatic route/DNS policy decisions outside the existing policy contracts.
