# Phase 39 — Remote/Mobile Client Connectivity & Security Hardening

**Status:** IMPLEMENTED / VERIFICATION PENDING

## Goal

Provide a reusable, transport-independent security foundation for Android/iOS/remote-machine clients that consume the existing control plane without prematurely introducing a mobile or desktop UI.

## Implemented on `main`

- Opaque per-device credentials with high-entropy secrets and bounded lifetime.
- Server-side keyed digests; raw device secrets are not persisted.
- Constant-time credential verification.
- Independent device and credential revocation.
- One-time rotating opaque refresh-token storage with replay rejection.
- Preservation of original refresh-token absolute expiry during rotation.
- Bounded remote-client scope allow-list; mutation privileges are not granted implicitly.
- Bounded in-memory security audit log.
- Recursive redaction of authorization headers, cookies, passwords, secrets, tokens, credentials and private-key material.
- Platform metadata for Android, iOS, Linux, macOS, Windows and unknown clients.
- Unit coverage for credential lifecycle, refresh replay, scope validation, audit bounds and secret redaction.

## Required API integration

The existing Fastify API still contains its earlier JWT/session implementation. The Phase 39 library primitives therefore cannot be declared operational until the API authentication lifecycle is migrated to them.

Required integration:

1. Login issues a short-lived access token plus a stateful opaque refresh token.
2. Refresh consumes the current refresh token exactly once and returns a replacement refresh token with the same absolute expiry.
3. Refresh replay is rejected and the affected session/device can be revoked.
4. Logout revokes the current session/credential state.
5. Device enrollment and revocation use the device-credential service rather than ad-hoc UUID secrets.
6. Remote-client scopes are validated against the bounded allow-list before a principal is created.
7. Authentication failures and authorization denials produce safe audit metadata without bearer material.
8. API tests exercise invalid, expired, revoked and replayed credentials through actual HTTP routes.

## Security contract

```text
Enroll device
  -> issue opaque credential
  -> authenticate credential
  -> issue short-lived access token
  -> issue opaque refresh token
  -> rotate refresh token on renewal
  -> revoke device/session on logout or compromise
```

## Verification gate

Phase 39 cannot advance to Phase 40 until all of the following pass on the resulting commit:

```text
pnpm install --frozen-lockfile
pnpm validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build

docker compose config
docker compose build
bash scripts/docker-smoke.sh
```

Security failure-path verification must cover:

- invalid device credential → reject;
- expired device credential → reject;
- revoked device credential → reject;
- refresh-token replay → reject;
- refresh rotation → preserve original expiry;
- disallowed remote-client scope → reject;
- logout/session revocation → reject subsequent refresh;
- audit metadata → no bearer/credential leakage.

## Documentation rule

Historical Phase 19–28 reports remain available for traceability but are not current architecture. Current behavior is defined by `docs/current-architecture.md`, `docs/security-architecture.md`, `docs/phases/README.md`, `PROJECT_STATE.md` and the repository-root `ROADMAP.md`.
