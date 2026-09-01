# Starlink External Egress Integration

IRP supports Starlink as an optional external egress source without requiring a local Starlink Dish on the client.

The repository catalog in `@irp/gateway-registry` records the upstream projects and services supplied for Starlink connectivity. The runtime adapter in `@irp/connectivity/starlink-gateway` turns a configured, reachable gateway into a normal `ConnectivityProvider` resource so the existing selection, failover, health verification, and policy pipeline can evaluate it.

## Important operational rule

IRP does **not** invent, embed, or distribute public Starlink proxy/VPN credentials. The catalog contains upstream references and capabilities only. A live gateway endpoint must be supplied by the operator through the deployment's configuration/secret-management layer.

This distinction is intentional:

- Self-hosted projects require a Starlink-connected node controlled by the operator.
- Managed services may expose their own service access, subject to their current terms and availability.
- Example/public IP addresses shown by upstream documentation are never treated as reusable IRP endpoints.
- Credentials and private connection strings are never committed to the repository.

## Catalogued upstream resources

- `starlink-reverse-egress` — Reverse WireGuard egress architecture.
- `javidnet` — LEAF/HOP/GATEWAY mesh with SOCKS5 client support.
- `javid-mask` — Xray/VLESS/VMess/Reality and WireGuard/VPS gateway patterns.
- `getastatic` — Managed public IPv4 over WireGuard for Starlink CGNAT.
- `egret` — Managed public IPv4 over WireGuard for Starlink/CGNAT links.
- `nasnet-connect` — Starlink/MikroTik networking and VPN gateway project.
- `starlinux-pi-starlink` — Raspberry Pi/OpenWRT Starlink gateway pattern.
- `gbrandt-pi-starlink` — Self-hosted Raspberry Pi Starlink VPN pattern.
- `raspberry-gateway` — Raspberry/Xray/SOCKS5 gateway pattern.
- `realink-setalink` — Managed service advertised as Starlink-powered.

## Runtime flow

```text
Configured external gateway
        |
        v
ExternalStarlinkGatewayProvider
        |
        v
ConnectivityManager
        |
        +--> health measurement
        +--> source scoring
        +--> policy evaluation
        +--> selection / failover
        +--> activation verification
        +--> rollback / recovery
```

The adapter intentionally treats tunnel lifecycle as externally managed. `connect`/`activate` verify the configured gateway rather than attempting to manipulate a provider account or a remote Starlink node without an explicit runtime integration.

## Example profile

```ts
const profile = {
  id: 'my-starlink-egress',
  name: 'My Starlink Egress',
  source: 'starlink-reverse-egress',
  protocol: 'wireguard',
  endpoint: 'gateway.example:443',
};
```

The endpoint above is illustrative only. Real deployments must provide their own reachable endpoint and credentials through secure runtime configuration.

## Security boundary

The Starlink catalog is metadata. It is not an endpoint database. The decision engine may select a Starlink-backed source only after normal IRP health, trust, policy, and verification checks succeed.
