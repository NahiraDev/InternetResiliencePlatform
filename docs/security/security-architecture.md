# Security Architecture

**Status:** canonical security architecture reference. Capability status must be checked against current implementation evidence.

## Security boundary

Security is layered across API authentication, `@irp/auth`, core policy/capability checks, runtime actions, persistence, telemetry, container/runtime controls and CI security gates.

```text
Request
  → Authentication
  → Principal
  → RBAC / capability check
  → Policy / safety check
  → Runtime or provider action
  → Verification
  → Audit / telemetry
```

Sensitive operations fail closed. A library primitive does not constitute a production security feature until transport integration, failure paths, tests and runtime verification are complete.

## Authentication and authorization

Authentication establishes identity. Authorization determines what the identity may do. Read/diagnostic capabilities are separate from network mutation and administrative capabilities.

The current auth implementation includes JWT validation and remote-client credential primitives. Route integration must be described according to actual verification state rather than library capability alone.

## Remote-client security

Remote clients use bounded device credentials, one-time refresh material and explicit scope allow-lists. Device secrets and refresh tokens must never be persisted in raw form where a keyed digest or equivalent protected representation is sufficient.

## API abuse protection

Authentication, expensive runtime/autopilot operations and other sensitive endpoints remain subject to rate/resource-abuse controls. Rate-limit behavior must remain standards-compliant.

## Network-probe safety

Network probing is a measurement capability, not an unrestricted scanner. SSRF controls must bound destinations, reject unsafe private/loopback/link-local/metadata targets, account for IPv4/IPv6 and redirects, and fail closed on ambiguous resolution.

## Secrets and telemetry

Bearer tokens, refresh tokens, device secrets, passwords, private keys and equivalent credentials must not appear in logs, traces, metrics, diagnostics, health responses or audit metadata.

## Runtime and supply chain

Production containers use least privilege and explicit writable paths. CI permissions follow least privilege. GitHub installation/access tokens are opaque values and must not be handled with fixed-length assumptions.

## Threat-model expansion

Future gateway, tunnel, plugin, mobile, multi-region and provider work requires explicit trust-boundary analysis before implementation is considered security-complete.
