# Starlink Integration

## Status

Starlink is integrated as a first-class connectivity resource through `@irp/starlink` and the existing `@irp/connectivity` provider contract.

The integration is intentionally **monitor-first**: IRP observes and scores the Starlink uplink, but it does not claim ownership of dish power, firmware, account state, or router configuration.

## Local dish telemetry

The default local Starlink dish endpoint is `192.168.100.1:9200`. The provider performs a TCP reachability probe and, when `grpcurl` is installed, requests `SpaceX.API.Device.Device/Handle` with `{"get_status":{}}`.

Telemetry currently mapped into IRP health:

- connection state
- POP latency
- packet loss/drop rate
- downlink throughput
- uplink throughput
- obstruction fraction
- uptime

The provider emits a normal `ConnectivityHealth` object so the existing Network Intelligence, selection, failover, and observability layers can consume Starlink without Starlink-specific branching.

## Tunnel and gateway architectures

The following architectures are registered as **integration profiles**, not as public credentials or hard-coded endpoints:

| Profile | Role | IRP use |
| --- | --- | --- |
| Starlink Reverse Egress | Starlink node initiates a persistent tunnel to a reachable VPS | Reverse-egress / shutdown-resilience topology |
| JavidNet | Starlink gateway plus mesh/leaf/hop/gateway model | Mesh gateway adapter |
| Javid Mask | Raspberry Pi gateway patterns using Xray/VLESS/VMess or WireGuard/VPS | Privacy gateway adapter |
| GetAStatic | WireGuard tunnel from Starlink CGNAT to a dedicated public IPv4 | Public-ingress tunnel profile |
| Egret | WireGuard tunnel from Starlink CGNAT to a dedicated public IPv4 | Public-ingress tunnel profile |
| NASNET Connect | Starlink + MikroTik gateway and multiple VPN/proxy services | Router gateway profile |
| Pi-Starlink / StarlinuX | Starlink + Linux/OpenWrt + WireGuard/OpenVPN/IPv6 | Self-hosted gateway profile |
| Raspberry Gateway | Starlink monitoring plus Xray/SOCKS gateway | Local gateway profile |

IRP must never embed a third-party private key, public account, free proxy URI, or claimed public Starlink exit endpoint. Credentials and endpoints belong in the existing credential/configuration abstractions.

## Selection and failover

Starlink receives a default connectivity priority below Ethernet/Wi-Fi and above low-confidence custom paths. Deployments can override this through the existing connectivity policy.

A Starlink resource is eligible for failover when:

1. the local dish API is reachable;
2. health is above the configured minimum;
3. the existing connectivity policy permits the source; and
4. any tunnel layered over Starlink passes its own verification gate.

For reverse-egress deployments, IRP should score the **complete path** rather than treating the local Starlink link alone as proof of end-to-end Internet reachability.

## E2E verification contract

A real Starlink E2E run must verify, in order:

1. dish API reachability;
2. Starlink telemetry availability;
3. local default-route reachability;
4. external DNS resolution;
5. external HTTPS/TLS reachability;
6. measured latency, loss and jitter;
7. tunnel handshake when a tunnel profile is enabled;
8. Internet reachability through the intended egress;
9. failover to another source;
10. recovery/failback without route flapping.

CI without Starlink hardware must use deterministic provider-contract tests only. A real Starlink E2E test belongs on a self-hosted runner physically connected to the Starlink LAN.

## Source references

These projects are reference implementations and architectural inputs. IRP does not vendor their runtime code.

- Starlink reverse egress: https://github.com/RezaHarirchian/starlink-reverse-egress
- JavidNet: https://github.com/Iman/javidnet
- Javid Mask: https://github.com/Iman/javid-mask
- NASNET Connect: https://github.com/nasnet-community/connect
- Pi-Starlink: https://github.com/gbrandt/Pi-Starlink
- StarlinuX / Pi-Starlink: https://github.com/davixdedem/Pi-Starlink
- Raspberry Gateway: https://github.com/d3vilh/raspberry-gateway
- GetAStatic Starlink tunnel: https://getastatic.com/starlink-static-ip
- Egret Starlink tunnel: https://egret.host/starlink-static-ip
- Starlink VPN compatibility: https://starlink.com/en-ps/support/article/e5dc0b86-09b4-084b-918b-3fa181e5fb5d

These references are deliberately treated as external integrations. Availability, pricing, limits, public endpoints and service behavior can change and must be verified at deployment time.
