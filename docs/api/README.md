# API Documentation

The API is the product boundary between clients, operators and the authoritative runtime.

## Contract principles

- APIs are versioned.
- Authentication and authorization are enforced server-side.
- Capability contracts are platform-neutral.
- Mutating operations return an explicit outcome; acceptance of a request is not proof of successful network mutation.
- Errors are structured and actionable without leaking secrets.
- Long-running operations expose observable state rather than requiring clients to guess from timeouts.

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

## Client rule

Web, desktop and mobile clients consume these contracts. They must not duplicate authoritative routing, gateway selection, failover or policy logic.

## Compatibility

Breaking changes require a versioned contract migration, updated consumers, tests and documentation. Deprecated endpoints must have an explicit retirement policy.

## Implementation status

Individual endpoints are production-supported only when their implementation and verification evidence exists. This index intentionally does not imply that every planned product area is already implemented.
