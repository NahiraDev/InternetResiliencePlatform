# Integration Baseline Matrix

Generated: 2026-09-11T21:09:48.785Z
Commit: unknown

## Component status

| Component | Executable | Deterministic status | Real environment |
|---|---:|---|---|
| @irp/auth | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/auto-optimization | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/config | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/connectivity | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/core | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/database | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/dns | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/events | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/failover | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/gateway-registry | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/historical-analysis | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/internet-intelligence-agent | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/kernel | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/linux-client | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/logger | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/macos-client | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/metrics | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/network | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/network-intelligence | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-api | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-config | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-events | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-loader | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-manager | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-registry | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-runtime | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-samples | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-sandbox | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/plugin-sdk | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/queue | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/resilience-runtime | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/routing | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/sdk | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/security | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/shared | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/telemetry | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/tunnel | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/types | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/utils | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/windows-client | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/api | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/cli | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |
| @irp/daemon | yes | CONNECTED_BUT_UNVERIFIED | BLOCKED |

## Integration edges

| Source | Target | Contract | Transport | Status |
|---|---|---|---|---|
| @irp/auth | @irp/shared | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/auto-optimization | @irp/resilience-runtime | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/connectivity | @irp/events | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/connectivity | @irp/kernel | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/connectivity | @irp/network | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/connectivity | @irp/telemetry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/connectivity | @irp/shared | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/core | @irp/config | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/core | @irp/logger | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/core | @irp/dns | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/events | @irp/shared | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/historical-analysis | @irp/database | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-api | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-api | @irp/security | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-config | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-config | @irp/security | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-events | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-loader | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-loader | @irp/plugin-registry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-manager | @irp/plugin-runtime | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-manager | @irp/plugin-loader | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-manager | @irp/plugin-registry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-manager | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-manager | @irp/plugin-samples | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-registry | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-runtime | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-runtime | @irp/plugin-api | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-runtime | @irp/plugin-config | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-runtime | @irp/plugin-events | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-runtime | @irp/plugin-registry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-runtime | @irp/plugin-sandbox | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-samples | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-sandbox | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-sandbox | @irp/security | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/plugin-sandbox | @irp/plugin-samples | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/queue | @irp/shared | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/connectivity | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/events | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/failover | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/gateway-registry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/internet-intelligence-agent | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/network-intelligence | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/routing | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/telemetry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/tunnel | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/resilience-runtime | @irp/utils | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/routing | @irp/connectivity | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/routing | @irp/events | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/routing | @irp/kernel | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/routing | @irp/shared | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/routing | @irp/telemetry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/sdk | @irp/kernel | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/security | @irp/auth | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/security | @irp/shared | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/telemetry | @irp/metrics | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/telemetry | @irp/types | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/tunnel | @irp/events | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/tunnel | @irp/shared | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/tunnel | @irp/telemetry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/auth | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/config | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/core | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/database | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/dns | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/events | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/historical-analysis | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/logger | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/metrics | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/network | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/queue | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/resilience-runtime | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/api | @irp/telemetry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/cli | @irp/config | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/cli | @irp/core | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/cli | @irp/logger | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/cli | @irp/network | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/cli | @irp/telemetry | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/cli | @irp/dns | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/cli | @irp/resilience-runtime | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/auto-optimization | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/config | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/connectivity | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/core | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/logger | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/plugin-manager | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/plugin-sdk | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/resilience-runtime | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/routing | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |
| @irp/daemon | @irp/tunnel | workspace dependency | node module import/link | CONNECTED_BUT_UNVERIFIED |

## Closed loop

`observe -> measure -> detect -> diagnose -> decide -> policy -> apply -> verify -> recover -> telemetry`

The graph is a connectivity inventory, not production evidence. An edge is not VERIFIED merely because a workspace dependency exists.

## Failure matrix

| Fault | Required behavior |
|---|---|
| dependency unavailable | consumer fails closed; no mutation without a valid dependency |
| measurement degraded | decision remains policy-constrained and must not claim healthy state |
| apply failure | verification must fail and recovery/failover must be attempted |
| verification failure | rollback/recovery path must execute and emit evidence |
| telemetry unavailable | operation may continue only according to explicit local safety policy; certification remains blocked |

## Real-environment boundary

All registered capabilities remain BLOCKED until independently observed evidence is bound to the tested commit and artifact.
