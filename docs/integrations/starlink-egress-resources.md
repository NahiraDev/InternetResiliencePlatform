# Starlink Egress Resources

IRP can model Starlink-backed remote egress as external connectivity resources without requiring a local Starlink dish.

## Sources tracked by the integration

- `starlink-reverse-egress` — reverse WireGuard architecture; requires an operator-managed Starlink node.
- `javidnet` — Starlink mesh architecture with LEAF/HOP/GATEWAY roles; a gateway requires a Starlink-connected node.
- `javid-mask` — Starlink-oriented privacy/VPN architecture; remote outbounds are operator-configured.
- `getastatic` — WireGuard-based public IPv4 tunnel service advertised for Starlink CGNAT.
- `egret` — WireGuard-based public IPv4 tunnel service advertised for Starlink CGNAT.
- `nasnet-connect` — MikroTik-oriented Starlink networking and VPN gateway project.
- `starlinux-pi-starlink` — self-hosted Starlink + OpenWRT/VPN architecture.
- `gbrandt-pi-starlink` — self-hosted Starlink VPN/IPv6 architecture.
- `raspberry-gateway` — Starlink gateway with Xray/SOCKS5 components.
- `realink-setalink` — externally operated VPN service claiming Starlink-powered connectivity.

## Important runtime rule

These repositories are **resource definitions and integration sources**, not embedded credentials or guaranteed public exits. IRP must never ship guessed endpoints, private keys, passwords, or fabricated public VPN configurations.

An operator can supply a real gateway through the `ExternalStarlinkGatewayProvider` using configuration/secret management. The provider probes the gateway and exposes it to the normal ConnectivityManager scoring, policy, failover, and verification pipeline.

```text
External Starlink Gateway
        |
        v
ExternalStarlinkGatewayProvider
        |
        v
ConnectivityManager
        |
        +--> Network Intelligence
        +--> Decision / Policy
        +--> Activation / Verification
        +--> Failover / Recovery
```

## No local Dish requirement

The external-gateway adapter does not call the local Starlink Dish API. The existing local Dish integration remains separate and is useful only when a Starlink terminal is actually present.

## Verification policy

A gateway is eligible only after a live health probe succeeds. The system should measure latency, loss, jitter, reachability and tunnel health before allowing it to become an active source.

Do not treat a repository URL, documentation example, or an example IP address as a live gateway.
