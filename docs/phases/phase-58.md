# Phase 58 — Real Network Measurements

## Status

**Implementation started; verification required.**

## Objective

Replace measurement placeholders and misleading derived values with bounded, auditable measurements from the local network stack and explicit probe providers. Phase 58 is an observability/measurement phase; it does not grant the measurement layer authority to mutate routing, DNS, tunnels or gateways.

## Scope

- production ICMP measurement provider using the platform `ping` utility without shell interpolation;
- packet-loss measurement backed by real ping success/failure samples;
- direct TLS handshake timing instead of using total HTTP GET time as a TLS metric;
- bounded bandwidth measurement using real transferred bytes and elapsed time;
- captive-portal signal detection as an explicit HTTP redirect signal;
- preserve mockable providers for deterministic tests;
- keep measurements cancellable and bounded by timeouts;
- expose measurements for the existing Internet Intelligence advisory layer without duplicating the control plane.

## Safety invariants

- Measurement code is read-only with respect to network configuration.
- Hostnames/URLs are passed as structured arguments; no shell command interpolation is permitted.
- Failed probes report failure/unknown evidence rather than fabricating success.
- Captive-portal redirects are evidence signals, not proof of filtering or censorship.
- The Internet Intelligence Agent remains advisory; existing policy/safety/decision engines remain authoritative.
- Simulation fixtures remain separate from production measurement providers.

## Verification gate

Phase 58 is not complete until `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm validate`, and required CI/runtime checks pass on the final Phase 58 commit.
