# Security Overview

IRP treats security as a system property spanning authentication, authorization, secrets, network actions, persistence, observability, and deployment.

## Security boundaries

```text
External client
      ↓
Authentication
      ↓
Authorization / scope
      ↓
Application service
      ↓
Policy / capability checks
      ↓
Provider or runtime action
      ↓
Verification + audit
```

## Core requirements

- Fail closed on security-sensitive operations.
- Do not grant network mutation merely because an observation capability exists.
- Keep secrets out of logs and telemetry.
- Use least privilege for containers, databases, and runtime identities.
- Validate and bound external input.
- Audit consequential security and network-control decisions.
- Treat dependency and supply-chain integrity as security controls.

## Authentication and authorization

Authentication establishes identity; authorization establishes what that identity may do. These concerns must not be collapsed into a single boolean check.

Capabilities exposed by packages are not automatically enabled for every transport or client. Integration status must be verified against the current implementation.

## Network-control safety

Network actions are high-impact operations. They require explicit action definitions, policy checks, bounded execution, verification, and rollback/circuit-breaker behavior where applicable.

## Reporting

See the repository `SECURITY.md` for vulnerability reporting and disclosure policy.
