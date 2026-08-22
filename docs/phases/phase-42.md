# Phase 42 — Remote Client API Integration

## Goal

Connect the Phase 39 remote-client security primitives to the real Fastify API lifecycle without weakening the existing headless authorization boundary.

## Implemented

- Remote device enrollment protected by `runtime.admin`.
- Opaque device credential exchange for short-lived access tokens.
- Access tokens use the existing IRP JWT contract and the existing `JwtAuthenticationProvider`/RBAC path.
- Bounded remote-client scopes are enforced at enrollment and carried into access/refresh sessions.
- Rotating opaque refresh tokens with single-use replay rejection.
- Device revocation invalidates active refresh sessions for that credential.
- Remote logout invalidates the rotated refresh session.
- Security audit events are bounded and sanitized by the existing Phase 39 audit primitive.
- Remote lifecycle routes are registered by the API entrypoint and production `runtime-entrypoint.mjs`.
- Production/staging require dedicated `REMOTE_CLIENT_CREDENTIAL_KEY` and `REMOTE_CLIENT_REFRESH_KEY` secrets.

## Routes

| Method | Route | Authorization |
| --- | --- | --- |
| POST | `/api/v1/auth/remote/devices/enroll` | existing access token + `runtime.admin` |
| GET | `/api/v1/auth/remote/devices` | existing access token + `runtime.admin` |
| POST | `/api/v1/auth/remote/token` | device credential |
| POST | `/api/v1/auth/remote/refresh` | rotating refresh token |
| POST | `/api/v1/auth/remote/logout` | rotating refresh token |
| POST | `/api/v1/auth/remote/devices/:credentialId/revoke` | existing access token + `runtime.admin` |
| GET | `/api/v1/auth/remote/audit` | existing access token + `runtime.admin` |

## Security Contract

The credential secret and refresh token are opaque values. Only digests are retained by the Phase 39 in-memory stores. Refresh tokens are single-use and rotate on every successful refresh. A replayed or revoked refresh token is rejected with `401`.

Remote access tokens are ordinary IRP access JWTs with the `remote_client` role and only the bounded remote-client scopes assigned at enrollment. Existing protected API routes therefore enforce the same RBAC semantics for remote clients as they do for first-party users.

Production and staging fail closed when the dedicated credential and refresh signing keys are absent.

## Verification

The implementation includes API-level tests for enrollment, credential exchange, scope propagation, refresh rotation/replay rejection, and device revocation.

Phase completion still requires the repository validation, typecheck, test, build, example smoke and Docker/runtime CI gates to pass on the resulting `main` commit.
