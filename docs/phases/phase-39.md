# Phase 39 — Device Identity & Scoped Sessions

**Status:** IMPLEMENTED / verification state inherited from current repository gates

## Goal

Provide the reusable, transport-independent security foundation for Android/iOS/desktop/remote-machine clients that consume the control plane.

## Implemented foundation

- Opaque per-device credentials with high-entropy secrets and bounded lifetime.
- Server-side keyed digests; raw device secrets are not persisted.
- Constant-time credential verification.
- Independent device and credential revocation.
- One-time rotating opaque refresh-token storage with replay rejection.
- Preservation of original refresh-token absolute expiry during rotation.
- Bounded remote-client scope allow-list; mutation privileges are not granted implicitly.
- Bounded security audit log.
- Recursive redaction of authorization headers, cookies, passwords, secrets, tokens, credentials and private-key material.
- Platform metadata for Android, iOS, Linux, macOS, Windows and unknown clients.
- Unit coverage for credential lifecycle, refresh replay, scope validation, audit bounds and secret redaction.

## Integration boundary

Phase 39 established the security primitives. The actual Fastify remote-client lifecycle was subsequently integrated in **Phase 42**. Therefore the original Phase 39 statement that API integration was still pending is historical and must not be treated as the current API state.

Current remote-client integration is documented in [`phase-42.md`](phase-42.md), which covers enrollment, opaque credential exchange, scoped access tokens, refresh rotation/replay rejection, logout, device revocation and production secret requirements.

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

The security foundation is not considered production-complete merely because the primitives exist. Applicable repository and runtime verification must pass on the relevant implementation commit, including:

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

Failure-path verification must cover invalid, expired and revoked device credentials, refresh-token replay, refresh rotation expiry preservation, disallowed scopes, logout/session revocation, and absence of credential material in audit output.

## Canonical references

- Current security architecture: [`../security/security-architecture.md`](../security/security-architecture.md)
- Remote-client API integration: [`phase-42.md`](phase-42.md)
- Current project truth: [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md)
- 70-phase execution contract: [`../architecture/product-roadmap-70-phases.md`](../architecture/product-roadmap-70-phases.md)
