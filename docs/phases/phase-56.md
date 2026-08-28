# Phase 56 — Unified Product API

## Status

**Implementation complete; final repository verification required.**

## Objective

Provide one versioned, server-authoritative capability API that Web, Desktop, iOS and Android clients can consume without duplicating routing, policy, gateway-selection or failover semantics.

## Scope delivered

Phase 56 adds:

- `/api/v1/product/capabilities` for public capability discovery;
- `/api/v1/product/context` for authenticated, principal-specific capability availability;
- explicit API major-version negotiation with `X-API-Version` / `Accept-Version`;
- HTTP `406` rejection for unsupported API versions;
- response headers advertising the selected and supported API versions;
- structured capability metadata for authentication mode, permissions, methods, paths, operation kind and verification status;
- a typed `InternetResilienceClient` surface for capability/context discovery and versioned generic requests;
- structured SDK errors for API-level failures;
- negative tests for unsupported versions, missing authentication and unauthorized capabilities.

## Contract

The Product API uses the existing `/api/v1` surface. Phase 56 does not introduce a second control plane or a second routing/policy abstraction.

The capability manifest intentionally distinguishes:

- `implemented` behavior that exists in the current repository;
- `pending-verification` contracts that are part of the product boundary but still require their implementation/runtime gate;
- `planned` future capability areas.

This prevents clients from treating roadmap entries as implemented APIs.

## Security properties

- `/api/v1/product/capabilities` contains no credentials or secret material.
- `/api/v1/product/context` requires the existing bearer authentication provider.
- Capability visibility is derived from the authenticated principal and existing RBAC authorization; the endpoint does not grant permissions.
- Device-credential token exchange is not exposed as a bearer-authorized capability.
- Unsupported API versions fail closed before capability context authentication is attempted.
- The SDK only permits generic requests under `/api/v1/`.
- No new third-party dependency or cryptographic primitive is introduced.

## Compatibility

The initial Product API major version is `v1`. Additive capability metadata and endpoints are backward-compatible within the major version. Breaking changes require a new API version plus consumer/test/documentation migration.

## Tests

`apps/api/src/unified-product-api.test.ts` covers:

1. public capability manifest discovery;
2. response version headers;
3. unsupported version rejection with HTTP 406;
4. no authentication attempt for unsupported versions;
5. authenticated context requirement;
6. capability filtering by server-side RBAC;
7. exclusion of device-credential session capabilities from bearer context.

`packages/sdk/src/index.test.ts` covers:

1. health/version compatibility;
2. capability discovery and version headers;
3. bearer propagation for authenticated context;
4. base-URL normalization;
5. restriction of generic calls to `/api/v1/`;
6. structured Product API errors.

## Acceptance criteria

- [x] One versioned Product API boundary is defined under `/api/v1`.
- [x] Capability discovery is available to all supported clients.
- [x] Authenticated capability context is server-authoritative.
- [x] API version negotiation and unsupported-version handling are implemented.
- [x] Authentication mode and RBAC requirements are explicit in the capability contract.
- [x] SDK support exists for capability discovery, context and versioned generic requests.
- [x] Invalid, unauthorized and compatibility failure paths are tested.
- [x] No duplicate routing/policy/failover decision logic is introduced in clients.
- [x] No dependency/lockfile graph expansion is required for Phase 56.
- [ ] `pnpm typecheck` passes on the final Phase 56 commit.
- [ ] `pnpm lint` passes on the final Phase 56 commit.
- [ ] `pnpm test` passes on the final Phase 56 commit.
- [ ] `pnpm build` passes on the final Phase 56 commit.
- [ ] `pnpm validate` passes on the final Phase 56 commit.
- [ ] Required CI checks are green on the final Phase 56 commit.

## Non-goals

- Implementing the Web Control Center (Phase 57).
- Introducing a new authentication system or RBAC model.
- Implementing pending gateway/tunnel/policy/analytics resources merely to populate the manifest.
- Moving authoritative networking logic into the SDK or UI clients.
