# Phase 45 — Network Identity & Destination Policy Assurance

## Status

**Implementation present; repository and CI verification gates remain required.**

## Objective

Make network identity explicit and independently verifiable so policy decisions can distinguish the actual egress identity from the destination identity. Geographic IP information alone is never treated as proof of service capability.

## Scope

- typed egress identity evidence with address family, observation time and source provenance;
- typed destination identity evidence with hostname, resolved addresses, protocol and source provenance;
- policy evaluation for allowed egress IP/ASN/organization and allowed destination hostname/address constraints;
- required independent egress evidence source;
- bounded freshness validation and explicit insufficient-data semantics;
- deterministic assurance findings suitable for Core and future Control Plane clients;
- tests for compliant, non-compliant, stale, insufficient-confidence and invalid evidence.

## Implementation

Phase 45 is implemented as an additive module in the existing `@irp/network-intelligence` package at `src/identity/IdentityAssurance.ts`. No new workspace package or dependency was introduced, preserving the existing dependency graph and frozen lockfile contract.

The assurance implementation validates IP address syntax and declared address family, requires resolved destination addresses, validates optional ASN/organization metadata, validates destination ports, and treats future-dated evidence as non-current evidence. The exported contract remains read-only and returns explicit `compliant`, `non-compliant`, or `insufficient-data` outcomes.

It keeps egress identity and destination identity as separate evidence dimensions and does not infer service capability from geography, ASN, or egress identity alone.

## Non-goals

- changing routes, DNS, tunnels or failover state;
- inferring service availability from geolocation or ASN alone;
- collecting raw payloads or credentials;
- replacing the existing destination classification, policy or network measurement engines.

## Architectural boundary

```text
Independent Egress Evidence ----+
                                |
Destination Evidence ------------+--> Identity Assurance --> Policy/Safety input
                                |
Existing Core classification ---+

Identity Assurance is read-only. It does not mutate network state.
```

Egress identity and destination identity remain separate evidence dimensions. A compliant egress does not imply a compliant destination, and an allowed destination does not imply an authorized egress.

## Acceptance criteria

1. Egress identity is represented independently from destination identity.
2. Policy evaluation can constrain egress IP, ASN, organization and evidence source.
3. Policy evaluation can constrain destination hostname and/or resolved address.
4. Stale, future-dated or insufficient-confidence evidence never silently becomes compliant.
5. Invalid IPs, address-family mismatches, timestamps, ports, destination addresses, ASN values and required identity fields are rejected.
6. Results distinguish `compliant`, `non-compliant`, and `insufficient-data` and provide deterministic findings.
7. No routing, DNS, tunnel or failover mutation occurs in the assurance layer.
8. Tests cover normal, normalization, boundary, invalid, stale/future, insufficient-confidence and policy-mismatch cases.
9. No secrets, credentials or raw payload data are represented by the contract.
10. `pnpm validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and CI must pass before completion is claimed.

## Security / threat review

- **Egress spoofing:** an assurance result identifies the evidence source; policy may require an independent source.
- **Destination conflation:** destination identity is evaluated separately from egress identity and cannot be inferred from it.
- **Stale evidence:** bounded freshness prevents old or future-dated network identity from being treated as current.
- **Insufficient evidence:** missing or low-confidence evidence produces `insufficient-data`, not a permissive result.
- **Malformed evidence:** invalid network identity fields are rejected before policy evaluation.
- **Policy bypass:** the module produces decision-support evidence only; Core policy/safety gates remain authoritative.
- **Sensitive data exposure:** contracts contain network identity metadata only and no credentials or raw payloads.

## Dependencies

Consumes network measurement and distributed evidence capabilities from Phases 7–18, 24–25, 39–44. The Phase 44 verification gate remains a prerequisite for declaring Phase 45 complete.

## Definition of Done

Implementation, shared contracts, tests, documentation, project state, repository validation and CI evidence must agree. Source presence alone is not completion evidence.
