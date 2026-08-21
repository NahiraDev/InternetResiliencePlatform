# Phase 39 — Remote/Mobile Client Connectivity & Security Hardening

## Goal

Provide a reusable, headless security foundation for Android/iOS/remote-machine clients that consume the existing control/data plane without introducing a mobile or desktop UI.

## Implemented

- Opaque per-device credentials with high-entropy secrets, bounded lifetime and explicit revocation.
- Constant-time credential verification using server-side HMAC digests; raw device secrets are never persisted in the credential record.
- A reusable rotating opaque refresh-token store with one-time-use semantics and replay rejection.
- Preservation of the original refresh-token absolute expiry during rotation; rotation cannot extend a session lifetime.
- Bounded remote-client scope allow-list. Remote clients default to read/inspection/status capabilities and do not implicitly receive runtime mutation privileges.
- Bounded in-memory security audit log with recursive redaction of authorization headers, cookies, passwords, secrets, tokens, credentials and private-key material.
- Platform metadata for Android, iOS, Linux, macOS, Windows and unknown clients.
- Deterministic unit coverage for issue/authenticate/revoke/expiry, refresh rotation and replay rejection, scope validation, audit-log bounds and secret redaction.

## Security Contract

```text
Enroll device
  -> issue opaque credential
  -> authenticate device credential
  -> exchange/associate with short-lived access token
  -> rotate refresh token on renewal
  -> revoke device/session on logout or compromise
```

The reusable security layer is deliberately independent of transport. Existing Fastify routes remain the control-plane integration boundary; no graphical client is introduced.

### Non-negotiable properties

- Access credentials must be short-lived and fail closed.
- Refresh credentials are opaque, stored only as keyed digests, and single-use after rotation.
- Device credentials are revocable independently of user identity.
- Remote clients receive an explicit bounded scope set; mutation privileges require separate authorization.
- Security telemetry must not persist bearer tokens or equivalent secret material.
- Audit storage is bounded and must not become an unbounded memory sink.
- Credential and token comparisons use constant-time equality.
- Rotation must never extend the original absolute session expiry.

## Current Integration Boundary

The repository already exposes the authenticated Fastify control plane through `/api/v1/*` and the existing `@irp/auth` package. Phase 39 adds the reusable device/refresh/audit primitives to that package so API and future Android/iOS/remote clients share one security contract.

API route wiring remains subject to the repository verification gate; the phase must not be called complete merely because the library implementation exists.

## Verification Gate

Required before advancing to Phase 40:

```text
pnpm install --frozen-lockfile
pnpm validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Additionally verify security failure paths with deterministic tests and API/runtime checks where the server is available:

- invalid device credential → reject
- expired device credential → reject
- revoked device credential → reject
- refresh-token replay → reject
- refresh rotation → preserve original expiry
- disallowed remote-client scope → reject
- audit metadata → no bearer/credential leakage

No README or UI changes are part of this phase.
