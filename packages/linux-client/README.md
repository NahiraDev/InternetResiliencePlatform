# IRP Linux Full Client

## Runtime boundary

The client uses the canonical `ResilienceRuntime`. Its safe default is observe/simulate-only; live operations still require the existing explicit execution controls and host privileges. The local HTTP surface is read-only unless a state-change bearer token is available.

## Optional WireGuard provider integration

The Linux client can register the repository's existing `WireGuardProvider` and `TunnelRegistryControlPlane` when the operator sets `IRP_TUNNEL_ENABLED=1`. It does not invent a VPN endpoint, peer key, client address or private key.

Configure these values in `/etc/irp/irp.env`:

| Variable | Required | Meaning |
|---|---:|---|
| `IRP_TUNNEL_ENABLED` | yes | Set to `1` to register the WireGuard provider; otherwise it stays disabled |
| `IRP_WIREGUARD_ENDPOINT_HOST` | yes | Operator-approved peer IP address or DNS hostname |
| `IRP_WIREGUARD_ENDPOINT_PORT` | yes | Peer UDP port |
| `IRP_WIREGUARD_PEER_PUBLIC_KEY` | yes | Peer public key |
| `IRP_WIREGUARD_ALLOWED_IPS` | yes | Comma-separated peer AllowedIPs CIDRs |
| `IRP_WIREGUARD_ADDRESS_CIDR` | yes | Client address assigned to the WireGuard interface |
| `IRP_WIREGUARD_CREDENTIAL_REF` | yes | Basename of the systemd credential containing the client private key |
| `IRP_WIREGUARD_ROUTING_MODE` | no | Only `splitTunnel` is accepted in this integration increment |
| `IRP_WIREGUARD_INTERFACE_NAME` | no | Defaults to `irpwg0` |
| `IRP_WIREGUARD_KEEPALIVE_SECONDS` | no | Defaults to `25`; use `0` to disable keepalive |

Live tunnel operations still run through the canonical runtime and require the existing explicit operation controls (`IRP_EXECUTION_MODE=real` and `IRP_ENABLE_AUTONOMOUS_LIVE_MUTATION=true`) plus the host's required `CAP_NET_ADMIN` privilege.

The private key must **not** be placed in `irp.env`. Provision it as a systemd credential instead. Create the source file with restrictive permissions, then uncomment the `LoadCredential=` line in `packages/linux-client/systemd/irp-linux-client.service` and set `IRP_WIREGUARD_CREDENTIAL_REF=irp_wireguard_private_key`. systemd supplies `CREDENTIALS_DIRECTORY`; the client accepts only a safe basename, opens without following symlinks, requires a regular file with no group/other permissions, and validates the WireGuard key before use.

When tunnel integration is enabled but configuration or systemd credentials are missing/invalid, Linux client startup fails closed. When disabled, no WireGuard provider is registered. The configured provider is available to the canonical tunnel adapter; enabling the environment flag does not independently start a tunnel.

**Scope of this step:** the existing provider creates the WireGuard interface, configures its peer and waits for a fresh handshake. This PR does not yet install Linux destination routes, change DNS, enable the nftables kill switch automatically, or prove public external egress. Full-tunnel mode is deliberately rejected until route installation, rollback and external-egress verification are integrated through the canonical runtime.

## Verification

Run from the repository root:

```sh
pnpm --filter @irp/linux-client typecheck
pnpm --filter @irp/linux-client lint
pnpm --filter @irp/linux-client test
pnpm --filter @irp/linux-client build
pnpm --filter @irp/tunnel test
```
