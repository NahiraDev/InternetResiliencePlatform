# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 51 — Automatic Gateway Selection (implementation in progress).
- **Phase 47:** verified green by CI and accepted as complete.
- **Phase 48:** implementation is complete and accepted after verification.
- **Phase 49:** WireGuard provider implementation is complete and accepted after CI/runtime verification.
- **Phase 50:** OpenVPN provider implementation is complete and accepted after repository/runtime verification.
- **Next phase after Phase 51:** Phase 52 — Automated Tunnel Lifecycle.
- **Roadmap:** 70 phases total and immutable as the current baseline. Additional execution/hardening phases may be proposed only after Phase 70 CTO/architecture review.
- **Core architecture:** headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are full product clients; mobile is not dashboard-only.
- **Gateway strategy:** `@irp/gateway-registry` owns gateway inventory/discovery/health and the Phase 51 selection primitive. `@irp/tunnel` owns tunnel contracts, lifecycle and concrete providers. Do not duplicate these domains.
- **UI strategy:** Web Control Center begins at Phase 57 and never owns safety-critical routing logic.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 51 — Automatic Gateway Selection

Phase 51 adds a side-effect-free gateway selection primitive to the canonical gateway domain. Selection consumes existing inventory and health contracts plus optional capacity evidence and never creates tunnels or mutates routes/DNS.

Phase 51 additions:

- policy-aware gateway eligibility;
- active lifecycle and trusted-gateway enforcement;
- health freshness, reachability, status and score validation;
- latency and packet-loss limits;
- optional capacity utilization limits;
- region/provider/tag/tunnel-protocol/address-family constraints;
- bounded deterministic scoring from health, quality, capacity and preferences;
- configurable hysteresis to prevent unnecessary gateway switching;
- deterministic gateway-ID tie breaking;
- explicit rejection reasons and score components;
- human-readable decision explanations;
- input immutability and no network/tunnel/route/DNS side effects;
- unit coverage for normal, boundary, invalid and failure-path selection behavior.

Phase 51 remains out of automated tunnel lifecycle, multi-gateway failover, fleet operations and gateway supply-chain hardening.

## Phase 50 — Additional Tunnel Providers

Phase 50 extends the canonical `@irp/tunnel` abstraction with an OpenVPN provider without creating a second tunnel lifecycle or decision model.

Phase 50 additions:

- `OpenVPNProvider` implementing the canonical `TunnelProvider` contract;
- provider capability declaration for OpenVPN over UDP/TCP and system scope;
- opaque credential-store boundary for complete client configuration;
- secure `0600` temporary client configuration handling with deterministic cleanup;
- non-shell OpenVPN execution through `execFile`;
- bounded startup and command timeouts;
- provider-owned PID tracking and deterministic connect/disconnect/destroy lifecycle;
- positive health evidence from live process state and OpenVPN status output;
- rejection of credential-managed executable script hooks;
- sanitized dependency errors for certificate material;
- concrete provider package subpath exports for WireGuard and OpenVPN;
- unit tests using command fakes only; no host networking mutation in CI.

The provider remains out of gateway selection, automatic failover, autonomous tunnel maintenance, routing policy, DNS orchestration, fleet provisioning and cross-platform native integration.

## Phase 49 — WireGuard Provider

The first concrete tunnel provider is implemented inside the canonical `@irp/tunnel` package so it consumes the Phase 48 contract directly without introducing another tunnel abstraction or workspace dependency.

Phase 49 additions:

- `WireGuardProvider` implementing the canonical `TunnelProvider` contract;
- provider capability declaration for WireGuard/UDP/system scope;
- injected credential-store boundary for private-key retrieval;
- `WireGuardProvider.generateKeyPair()` using the WireGuard tooling without passing private keys through argv;
- non-shell command execution through `execFile`;
- bounded command timeouts;
- secure `0600` temporary private-key file handling with cleanup;
- peer endpoint, allowed-IPs and persistent-keepalive configuration;
- Linux WireGuard interface creation and activation through `ip`/`wg` commands;
- deterministic connection/disconnection/destroy handling;
- recent-handshake + interface-state health classification;
- sanitized dependency errors;
- rejection of pre-existing provider interface names so the provider cannot silently take ownership of an unrelated interface;
- failure cleanup of an interface created during a failed connection;
- provider unit tests using command fakes only; no host networking mutation in CI.

The provider remains out of gateway selection, automatic failover, routing policy, DNS orchestration, fleet provisioning and cross-platform native integration. Those concerns remain in their roadmap phases.

## Phase 48 — Secure Tunnel Abstraction

The authoritative tunnel implementation is `@irp/tunnel`. Existing provider-neutral lifecycle/state/provider contracts were retained and hardened rather than creating a parallel abstraction.

Phase 48 additions:

- provider compatibility validation before provider execution;
- protocol, endpoint, scope, routing-mode and required-capability checks;
- bounded tunnel operation helper with 1–300 second production bounds;
- cooperative cancellation support where providers expose it;
- health evidence validation for timestamp freshness, latency, packet loss and internal consistency;
- explicit lifecycle transition authority through the existing `transitionTunnel` state machine;
- credential-reference-only security boundary;
- no private-key storage/generation/logging in the generic abstraction;
- no route/DNS/failover mutation;
- no new external dependencies.

## Phase 47 — Gateway Discovery & Health

Implemented and verified:

- provider-neutral gateway discovery reconciliation;
- registration and metadata reconciliation;
- retired-gateway resurrection protection;
- stale inventory reporting;
- health states: `healthy`, `degraded`, `unreachable`, `stale`, `unknown`;
- deterministic quality scoring from latency and packet loss;
- bounded measurement/timestamp validation;
- hard per-probe timeout;
- no route, DNS, tunnel or failover mutation.

## Phase 46 — Gateway Registry

Implemented and verified gateway inventory primitives:

- stable identity and endpoint metadata;
- ownership/provider metadata;
- capabilities and address-family declaration;
- lifecycle: `registered`, `active`, `draining`, `disabled`, `retired`;
- trust: `untrusted`, `pending`, `trusted`, `revoked`;
- bounded filtering;
- defensive copies;
- safe retirement/removal;
- revoked trust cannot be silently restored.

## Earlier Security/Intelligence Contracts

- Phase 43: signed distributed probe federation with replay protection, revocation, bounded ingestion and regional comparison.
- Phase 44: deterministic historical/federated analytics, percentiles, trends, confidence, anomaly detection and insufficient-data semantics.
- Phase 45: explicit egress identity, destination identity and policy assurance with independent egress evidence and bounded freshness validation.

## Verification Rules

A phase is not complete because source files exist. Completion requires acceptance criteria plus repository verification and, where relevant, runtime/online evidence.

For every phase:

1. inspect existing implementation before adding abstractions;
2. preserve compatible contracts unless a breaking change is explicitly required;
3. add normal, boundary, invalid and failure-path tests;
4. run repository validation, typecheck, lint, relevant tests and build;
5. apply security/abuse review to security-sensitive changes;
6. verify runtime behavior for networking/process/container changes;
7. update documentation and project state;
8. require green CI before marking the phase complete.

For networking automation, every mutation must be policy-checked, bounded, observable, reversible and auditable.

## Product Objective

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn → Explain
```
