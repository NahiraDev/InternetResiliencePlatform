# Full-System Real-Environment Assurance

This is the repository-wide assurance layer. It is intentionally separate from deterministic CI/System Assurance and from production certification.

## What this guarantees

The matrix scanner derives an inventory from the repository itself rather than a hand-maintained package list. It covers workspace packages, applications, mobile/network-extension clients, operational/infrastructure surfaces, and all GitHub Actions workflows. It also checks the roadmap phase-document boundary.

Each discovered executable surface receives a row containing its path, type, capability, entrypoint/build/test metadata, source-file count, dependencies, owning-phase placeholder, and real-environment assurance status.

## Critical rule

An executable component without a concrete real-environment assurance adapter is **BLOCKED**, never PASS.

The scanner therefore does not manufacture production evidence and does not turn unavailable devices, regions, gateways, DNS resolvers, tunnels, databases, or network interfaces into green checks.

## Two assurance layers

1. **Continuous system assurance** executes deterministic repository/runtime checks in CI.
2. **Real-environment production certification** consumes independently observed evidence from actual environments and binds that evidence to the tested commit and artifact identity.

The second layer remains PENDING/BLOCKED until the real environment has actually been exercised.

## Required real-environment coverage

The final certification track must exercise, where applicable:

- control plane and API
- resilience runtime
- network intelligence and measurements
- DNS resolution and DNS degradation/recovery
- gateway discovery/selection/failover
- routing
- WireGuard/OpenVPN tunnel lifecycle and real traffic
- database and migrations
- daemon and host integration
- Linux/macOS/Windows clients
- Android client/VPN
- iOS client/Network Extension
- telemetry/metrics/traces
- security boundaries
- Docker/Kubernetes deployment surfaces
- regional validation
- backup/restore
- upgrade/rollback
- chaos/soak
- release artifacts

For network paths, evidence must represent real traffic and a real failure/recovery sequence, not a mock or fixture.

## Closed-loop requirement

Certification evidence must be traceable through:

`Observe -> Measure -> Detect -> Diagnose -> Decide -> Policy/Safety -> Apply -> Verify -> Recover -> Telemetry`

A green build is not equivalent to a green production certification.
