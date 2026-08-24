# Phase 49 — WireGuard Provider

## Status

**Implementation:** present on `main` pending CI verification.

**Verification:** pending. Phase 49 is not complete until repository validation, typecheck, lint, workspace tests and build gates are green, plus applicable Linux runtime verification.

## Objective

Provide the first production tunnel provider on top of the Phase 48 provider-neutral abstraction using WireGuard on supported Linux hosts. The provider must keep key material outside the tunnel session model, execute commands without a shell, enforce bounded operations, and expose deterministic health evidence.

## Scope

- Canonical `WireGuardProvider` implementation in `@irp/tunnel`.
- Provider capability declaration for WireGuard, UDP and system scope.
- Credential-store interface for private-key retrieval by opaque reference.
- WireGuard key generation/derivation through `wg genkey` and `wg pubkey` without placing private keys in command arguments.
- Secure temporary private-key file handling with mode `0600` and deterministic cleanup.
- Non-shell execution through `execFile`.
- Linux WireGuard interface creation, peer configuration, address assignment and interface activation.
- Peer endpoint, allowed-IPs and persistent-keepalive configuration.
- Connection, disconnection and destroy lifecycle operations.
- Fresh-handshake and interface-state health evaluation.
- Bounded command timeouts.
- Sanitized provider errors.
- Defensive configuration copies.
- Failure cleanup for interfaces created by the provider.
- Unit tests with command-runner fakes; no CI test mutates host networking.

## Security invariants

1. Private keys are accessed through an opaque credential reference and are never stored in `Tunnel` metadata.
2. Private-key material is never passed as a process argument.
3. Temporary private-key files are created with restrictive permissions and removed after `wg set` completes.
4. Commands are executed without a shell; user-controlled endpoint values are arguments, not shell fragments.
5. Provider command output is treated as untrusted dependency output and key-looking material is sanitized from provider errors.
6. Tunnel interface naming is bounded and validated.
7. A pre-existing interface with the provider's reserved name must not be silently adopted by the provider.
8. A failed connection cleans up an interface created during that attempt.
9. Health classification requires both interface availability and a recent WireGuard handshake to report `healthy`.
10. The provider does not choose gateways, mutate unrelated routes/DNS state, or implement failover policy.

## Acceptance tests

- WireGuard provider satisfies the Phase 48 provider contract.
- Non-key authentication is rejected.
- Missing private-key credential reference is rejected.
- Key generation and derivation use the WireGuard tools without passing private keys through argv.
- Tunnel creation does not persist private-key material.
- Connect uses non-shell command execution.
- Connect configures the interface and peer and returns a connection handle.
- Disconnect removes only provider-owned runtime state.
- Health reports `healthy` only for an active interface with a fresh handshake.
- Health reports `degraded` for an active interface with stale/no handshake.
- Invalid key material and invalid peer configuration are rejected.
- Connection failures trigger best-effort cleanup of an interface created by that attempt.
- Tests cover normal, invalid, timeout/failure and secret-handling cases.

## Explicit non-goals

- WireGuard deployment/provisioning across a gateway fleet (Phase 54).
- Automatic gateway selection (Phase 51).
- Multi-gateway failover (Phase 53).
- Key rotation orchestration beyond the underlying WireGuard protocol lifecycle (later security/fleet phases).
- Kill-switch implementation and platform-specific firewall policy.
- DNS orchestration.
- macOS/Windows/iOS/Android native integration.

## Verification gate

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm validate:docs
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Linux runtime verification must be performed only on an authorized host with the WireGuard tooling available; repository tests use fakes and do not alter host networking.

WireGuard's protocol includes periodic key rotation and explicit handshake/rekey timing; the provider therefore treats a recent handshake as a health signal rather than treating interface existence alone as proof of a live peer. citeturn847888search3turn847888search4

## Architectural boundary

Phase 49 implements one concrete provider behind the Phase 48 abstraction. The Core remains provider-neutral. Later phases may add other providers without changing the decision model or client contracts.
