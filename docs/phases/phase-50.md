# Phase 50 — Additional Tunnel Providers

## Status

**Implementation:** present on `main` pending CI verification.

**Verification:** pending. Phase 50 is not complete until repository validation, typecheck, lint, workspace tests and build gates are green.

## Objective

Extend the Phase 48 provider-neutral tunnel abstraction with a second production tunnel backend without changing the Core decision model or duplicating tunnel lifecycle contracts.

## Scope

- Canonical `OpenVPNProvider` implementation in `@irp/tunnel`.
- Credential-reference-only boundary for OpenVPN client configuration.
- Secure temporary client configuration handling with restrictive permissions and deterministic cleanup.
- Non-shell OpenVPN process execution through `execFile`.
- Bounded startup and command timeouts.
- Explicit OpenVPN process ownership through a provider runtime map and PID tracking.
- Deterministic connect, disconnect and destroy lifecycle operations.
- Health evidence based on live process state plus OpenVPN status output; process existence alone is not considered healthy.
- Provider capability declaration for OpenVPN over UDP/TCP and system scope.
- Rejection of OpenVPN executable script hooks supplied through the credential-managed profile.
- Sanitized dependency errors so certificate material is not propagated through provider errors.
- Public package subpath exports for concrete providers.
- Unit tests using command fakes; tests do not mutate host networking.

## Security invariants

1. OpenVPN client configuration is retrieved through an opaque credential reference and is never stored in the `Tunnel` model.
2. Client configuration and certificate/key material are never passed as process arguments.
3. Temporary configuration files are created with restrictive permissions and removed after lifecycle termination.
4. Commands are executed without a shell; endpoint/config paths are passed as discrete arguments.
5. Credential-managed profiles cannot introduce executable OpenVPN script hooks through this provider boundary.
6. Provider-owned runtime state is tracked by tunnel ID and process ID; unrelated processes are never adopted.
7. Stop operations use the provider-owned PID and bounded termination, with a forced termination fallback only after the configured deadline.
8. Health is not reported as healthy from process existence alone; OpenVPN connection status must provide positive evidence.
9. The provider does not choose gateways, implement failover, mutate DNS policy, or own routing decisions.
10. The provider remains behind the existing `TunnelProvider` contract and does not create a parallel abstraction.

## Acceptance tests

- OpenVPN provider satisfies the Phase 48 `TunnelProvider` contract.
- Unauthenticated configurations are rejected.
- Missing credential references are rejected.
- Tunnel creation contains no client profile or certificate/key material.
- OpenVPN startup uses non-shell command execution.
- Client configuration is absent from command arguments.
- Executable script hooks are rejected at the credential boundary.
- Provider startup failures are classified and sanitized.
- Provider capabilities expose OpenVPN, UDP/TCP, system scope, reconnect and health-check support.
- Connect/disconnect/destroy lifecycle is deterministic and bounded.
- Health requires both a live provider-owned process and positive OpenVPN status evidence.
- Tests cover normal, invalid, failure, timeout and secret-handling boundaries.

## Explicit non-goals

- Automatic gateway selection (Phase 51).
- Tunnel lifecycle automation and autonomous maintenance (Phase 52).
- Multi-gateway failover (Phase 53).
- Gateway provisioning/fleet operations (Phase 54).
- Gateway security/compliance and supply-chain certification (Phase 55).
- DNS orchestration or kill-switch policy.
- Cross-platform native client integration.
- Provider-specific routing policy.

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

Runtime verification for OpenVPN must be performed only on an authorized host with the OpenVPN tooling and required privileges available. Repository tests use fakes and do not alter host networking.

## Architectural boundary

Phase 50 adds another concrete provider behind the existing Phase 48 contract. Core selection, policy, gateway ownership, failover and client behavior remain provider-neutral. Future providers must follow the same credential, process-safety, bounded-operation and health-evidence invariants.
