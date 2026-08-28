# API Documentation

The API is the product boundary between clients, operators and the authoritative runtime.

## Contract principles

- APIs are versioned.
- Authentication and authorization are enforced server-side.
- Capability contracts are platform-neutral.
- Mutating operations return an explicit outcome; acceptance of a request is not proof of successful network mutation.
- Errors are structured and actionable without leaking secrets.
- Long-running operations expose observable state rather than requiring clients to guess from timeouts.
- Capability discovery is server-authoritative; clients do not infer availability from implementation details.

## API areas

| Area | Responsibility |
| --- | --- |
| Status | Current runtime and network health |
| Devices | Enrollment, identity and lifecycle |
| Policies | User/operator network policy |
| Gateways | Authorized gateway inventory and health |
| Tunnels | Supported tunnel lifecycle |
| Diagnostics | Evidence and investigation results |
| Analytics | Historical and aggregated measurements |
| Events | Notifications and state changes |
| Administration | Deployment and operator functions |

## Unified Product API

Phase 56 establishes `/api/v1/product/capabilities` as the discovery contract used by all product clients and `/api/v1/product/context` as the authenticated capability view for a specific principal.

The capability manifest declares:

- the supported API major version and path prefix;
- supported client platforms;
- capability status (`implemented`, `pending-verification`, `planned`);
- operation kind (`read`, `mutate`, `stream`);
- supported HTTP methods and canonical paths;
- authentication mode;
- required server-side permissions.

Clients may request `X-API-Version: v1` or `Accept-Version: v1`. Unsupported versions fail closed with HTTP `406` and an explicit supported-version list. Successful Product API responses expose `X-API-Version` and `X-API-Supported-Versions` headers.

The SDK exposes typed capability discovery through `InternetResilienceClient.capabilities()` and authenticated context through `InternetResilienceClient.context()`. Generic client calls are restricted to `/api/v1/*` so a client cannot silently target an unversioned API surface.

The wire contract is authoritative in the API implementation. SDK types are intentionally kept wire-compatible without adding a new package dependency or altering the lockfile dependency graph.

## Client rule

Web, desktop and mobile clients consume these contracts. They must not duplicate authoritative routing, gateway selection, failover or policy logic.

## Compatibility

Breaking changes require a versioned contract migration, updated consumers, tests and documentation. Deprecated endpoints must have an explicit retirement policy.

## Implementation status

Individual endpoints are production-supported only when their implementation and verification evidence exists. The Phase 56 capability manifest distinguishes implemented behavior from pending verification and planned resources.
