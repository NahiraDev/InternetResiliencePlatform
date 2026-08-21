# Security Architecture

**Status:** current implementation reference for `main` at Phase 39.

## Security boundary

Security is layered across `apps/api`, `@irp/auth`, `@irp/core`, `@irp/telemetry`, container/runtime controls and CI security gates.

The primary API authentication path is:

```text
HTTP request
  -> JWT access-token authentication
  -> Principal construction
  -> RBAC permission check
  -> route-specific operation
  -> structured audit/telemetry without bearer secrets
```

Authentication and authorization are fail-closed. Protected routes must not silently fall back to anonymous access.

## JWT

`@irp/auth` currently provides an HMAC-SHA256 JWT implementation with:

- explicit issuer validation;
- algorithm/type validation;
- signature verification using constant-time comparison;
- access/refresh token type separation;
- expiry enforcement;
- subject, role, scope, organization and session identifiers;
- production enforcement of `JWT_SECRET`.

JWT access tokens are short-lived. Refresh handling is a stateful security boundary and must reject revoked, expired or replayed credentials.

## RBAC

`RbacAuthorization` evaluates explicit permissions from the authenticated principal. Platform administration is an explicit role capability rather than an anonymous fallback.

Runtime and autopilot mutation permissions are intentionally separate from read/inspection permissions.

## Phase 39 remote-client security

`@irp/auth` now contains reusable primitives for future Android/iOS/remote-machine clients:

- high-entropy opaque device credentials;
- keyed credential digests rather than persisted raw secrets;
- constant-time verification;
- independent device revocation;
- one-time rotating opaque refresh-token storage;
- bounded remote-client scope allow-list;
- bounded security-audit events with recursive secret redaction.

The implementation is deliberately transport-independent. API route integration is a Phase 39 completion gate and must not be described as complete before it is wired into the actual login/refresh/device lifecycle.

## API abuse protection

The API also has shared rate/resource-abuse controls. Authentication, expensive runtime/autopilot operations and other sensitive operations must remain behind the repository's rate-limit policy. HTTP `429` handling must remain standards-compliant and must not be weakened to make tests pass.

## SSRF and network-probe safety

Server-side URL fetching and network-probe functionality must remain bounded. Probes are measurement primitives, not an unrestricted external scanner. SSRF controls must reject loopback, private, link-local and metadata destinations, account for IPv4/IPv6 and redirects, and fail closed on ambiguous resolution.

## Secrets and telemetry

Bearer tokens, refresh tokens, device secrets, passwords, private keys and equivalent credentials must never appear in logs, traces, metrics, health responses, diagnostics or audit metadata.

Phase 39 audit metadata uses recursive redaction and bounded retention. Observability labels must remain low-cardinality.

## Container and supply chain

Production containers run as non-root and preserve the existing explicit writable-path/tmpfs contract. GitHub Actions permissions remain least-privilege, and GitHub tokens are treated as opaque values with no fixed-length assumptions.

## Security invariant

A feature is not security-complete because the library primitive exists. The transport integration, failure paths, tests and production runtime verification must all pass before the capability is considered operational.
