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
| `IRP_WIREGUARD_AUTOCONNECT` | no | Set to `1` to request an initial canonical tunnel connection; defaults to `0` |

Live network operations still run through the canonical runtime and require both explicit operation controls (`IRP_EXECUTION_MODE=real` and `IRP_ENABLE_AUTONOMOUS_LIVE_MUTATION=true`) plus host verification of Linux, effective `CAP_NET_ADMIN`, and the `ip` binary. `tunnel.write` is granted only when WireGuard is configured, `wg` is executable, and systemd `CREDENTIALS_DIRECTORY` is present. The `/health` response exposes the resolved mode, host evidence and blockers. Missing facts downgrade the runtime to simulation/observe-only; environment flags alone never grant mutation authority.

The private key must **not** be placed in `irp.env`. Provision it as a systemd credential instead. Create the source file with restrictive permissions, then uncomment the `LoadCredential=` line in `packages/linux-client/systemd/irp-linux-client.service` and set `IRP_WIREGUARD_CREDENTIAL_REF=irp_wireguard_private_key`. systemd supplies `CREDENTIALS_DIRECTORY`; the client accepts only a safe basename, opens without following symlinks, requires a regular file with no group/other permissions, and validates the WireGuard key before use.

When tunnel integration is enabled but configuration or systemd credentials are missing/invalid, Linux client startup fails closed. When disabled, no WireGuard provider is registered. The configured provider is available to the canonical tunnel adapter. `IRP_WIREGUARD_AUTOCONNECT=1` creates a canonical `tunnel_switch` candidate for initial connection; otherwise the client only observes the provider. After a managed tunnel loses its handshake, the observer can request a bounded canonical reconnect (two attempts). Both initial connect and reconnect require the host-owned `tunnel.write` grant and live runtime policy; the observation provider itself cannot connect or mutate the tunnel.

## Split-tunnel route selection

The Linux route-discovery integration advertises the configured AllowedIPs to the existing `RoutingEngine` only while the canonical tunnel control plane tracks an active tunnel and the WireGuard provider reports a fresh, healthy peer handshake. A missing or stale handshake withdraws the candidate route. The route candidate is marked as a VPN path and names the configured WireGuard interface.

The provider is read-only: it does not install routes itself. When the canonical runtime authorizes a `route_change` for a destination covered by an AllowedIP, route application still passes through the canonical privileged mutation boundary, the Linux kernel routing contract and the journaled Linux route executor. Post-apply verification now checks that the installed route uses the selected interface and gateway, rather than accepting any route to the same destination. Configure `IRP_DESTINATION_IP` and optionally `IRP_DESTINATION_PORT` when a live TCP destination probe is required.

This does not automatically connect the tunnel or install every AllowedIP merely because `IRP_TUNNEL_ENABLED=1`. The canonical runtime must first establish the tunnel and authorize the route-change operation. A healthy handshake and an installed device route are not proof that the remote destination or public internet is reachable.

**Remaining scope limits:** default-route AllowedIPs (`0.0.0.0/0` and `::/0`) and full-tunnel mode remain rejected. This integration does not yet change DNS, automatically enable/enforce the nftables kill switch, or prove that public traffic exits through the remote peer. Those require a provisioned trusted peer, DNS and leak-protection lifecycle, and an independent external-egress test.

## Verification

Run from the repository root:

```sh
pnpm --filter @irp/linux-client typecheck
pnpm --filter @irp/linux-client lint
pnpm --filter @irp/linux-client test
pnpm --filter @irp/linux-client build
pnpm --filter @irp/tunnel test
```
