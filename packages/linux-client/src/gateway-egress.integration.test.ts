/**
 * Real Linux gateway/egress verification.
 *
 * This test drives the **production** pieces — the canonical gateway selection plane, the real
 * WireGuard provider, the canonical `RoutingEngine` with the Linux route executor and the real
 * Linux destination probe — against a real WireGuard tunnel whose peer hosts an external
 * destination.
 *
 * The assertions are about observable facts, not about the runtime's own bookkeeping:
 *
 * - the kernel routes the external destination through the tunnel interface;
 * - the external destination observes the connection arriving with the **tunnel** source address,
 *   which can only happen if the traffic was encrypted, carried across the tunnel and
 *   decapsulated by the peer;
 * - the tunnel reports a real handshake and real transferred bytes.
 *
 * The test needs privileges (CAP_NET_ADMIN and CAP_SYS_ADMIN, or an equivalent user namespace).
 * When they are missing the test is skipped with the exact reason — it is never silently
 * reported as a pass. To run it with the privileges of a user namespace:
 *
 * ```sh
 * unshare -Urn pnpm --filter @irp/linux-client exec vitest run src/gateway-egress.integration.test.ts
 * ```
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinuxNetworkControlPlane } from './linux-network-control-plane.js';
import { createLinuxGatewaySelectionPlane } from './linux-gateway-selection.js';
import { createLinuxWireGuardIntegrationFromEnvironment } from './linux-wireguard.js';
import {
  createGatewayEgressLab,
  detectGatewayEgressLabSupport,
} from './gateway-egress-lab.js';

describe('gateway egress over a real WireGuard tunnel', () => {
  it(
    'carries traffic to an external destination through the selected tunnel',
    async (ctx) => {
      const support = await detectGatewayEgressLabSupport();
      if (!support.supported) {
        ctx.skip();
        // eslint-disable-next-line no-console
        console.warn(
          `[gateway egress] skipped: ${support.reasons.join('; ')}. Run under ` +
            '`unshare -Urn` (or as root) to execute the real tunnel verification.',
        );
        return;
      }

      const lab = await createGatewayEgressLab();
      const stateDirectory = await mkdtemp(join(tmpdir(), 'irp-gateway-egress-state-'));
      try {
        await lab.startDestinationListener();

        // The production WireGuard integration, configured from the lab's real key material.
        const integration = createLinuxWireGuardIntegrationFromEnvironment(lab.environment, {
          credentialsDirectory: lab.credentialsDirectory,
        });
        expect(integration).toBeDefined();

        // The production Linux control plane with live route mutation.
        const plane = createLinuxNetworkControlPlane({
          enableLiveRouteMutation: true,
          stateDirectory,
          registerStarlink: false,
        });

        // The real connectivity source is the underlay interface the tunnel rides on.
        await plane.connectivity.discoverResources();
        const source = plane.connectivity
          .getAvailableSources()
          .find((candidate) => candidate.interfaceName === lab.underlayInterface);
        expect(source).toBeDefined();
        const sourceId = source!.sourceId;

        const gatewaySelection = createLinuxGatewaySelectionPlane(plane.connectivity, {
          tunnel: integration!,
          trustedSourceIds: [sourceId],
          destination: {
            kind: 'ip',
            value: lab.destination,
            family: 'ipv4',
            port: lab.destinationPort,
          },
          routing: plane.routing,
        });
        expect(gatewaySelection).toBeDefined();

        // Precondition, observed independently: the destination has no route through the tunnel.
        expect(await lab.routeGet(lab.destination)).not.toContain(lab.tunnelInterface);

        await gatewaySelection!.synchronize();
        const receipt = await gatewaySelection!.apply(sourceId);

        // The runtime's own claim: the gateway was established and its egress was verified.
        expect(receipt.egressVerified).toBe(true);
        expect(receipt.tunnelId).toBeDefined();
        expect(receipt.destination).toBe(lab.destination);

        // Kernel truth: the destination is routed through the tunnel interface.
        const route = await lab.routeGet(lab.destination);
        expect(route).toContain(`dev ${lab.tunnelInterface}`);
        expect(route).toContain(`src ${lab.clientTunnelAddress}`);

        // Peer truth: the destination observed the tunnel address as the connection source.
        const observed = await lab.observedPeerAddresses();
        expect(observed).toContain(lab.clientTunnelAddress);

        // Protocol truth: a real handshake happened and real bytes crossed the tunnel.
        const clientHandshakes = await lab.clientWireguard(['latest-handshakes']);
        expect(clientHandshakes.trim()).not.toBe('');
        const clientTransfer = await lab.clientWireguard(['transfer']);
        const transferred = clientTransfer
          .trim()
          .split('\n')
          .map((line) => line.trim().split('\t'))
          .filter((parts) => parts.length >= 3)
          .map((parts) => ({ received: Number(parts[1]), sent: Number(parts[2]) }));
        expect(transferred.length).toBeGreaterThan(0);
        expect(transferred.reduce((total, entry) => total + entry.sent, 0)).toBeGreaterThan(0);
        expect(transferred.reduce((total, entry) => total + entry.received, 0)).toBeGreaterThan(0);
      } finally {
        await rm(stateDirectory, { recursive: true, force: true });
        await lab.teardown();
      }
    },
    120_000,
  );

  it(
    'fails closed and rolls the tunnel and the route back when the destination is not served',
    async (ctx) => {
      const support = await detectGatewayEgressLabSupport();
      if (!support.supported) {
        ctx.skip();
        // eslint-disable-next-line no-console
        console.warn(
          `[gateway egress rollback] skipped: ${support.reasons.join('; ')}. Run under ` +
            '`unshare -Urn` (or as root) to execute the real rollback verification.',
        );
        return;
      }

      const lab = await createGatewayEgressLab();
      const stateDirectory = await mkdtemp(join(tmpdir(), 'irp-gateway-egress-rollback-'));
      try {
        // The destination address exists behind the tunnel peer, but nothing serves it: the
        // path is up and the service is not, which must not be reported as egress.
        const integration = createLinuxWireGuardIntegrationFromEnvironment(lab.environment, {
          credentialsDirectory: lab.credentialsDirectory,
        });
        const plane = createLinuxNetworkControlPlane({
          enableLiveRouteMutation: true,
          stateDirectory,
          registerStarlink: false,
        });
        await plane.connectivity.discoverResources();
        const source = plane.connectivity
          .getAvailableSources()
          .find((candidate) => candidate.interfaceName === lab.underlayInterface);
        expect(source).toBeDefined();
        const sourceId = source!.sourceId;

        const gatewaySelection = createLinuxGatewaySelectionPlane(plane.connectivity, {
          tunnel: integration!,
          trustedSourceIds: [sourceId],
          destination: {
            kind: 'ip',
            value: lab.destination,
            family: 'ipv4',
            port: lab.destinationPort,
          },
          routing: plane.routing,
        });

        await gatewaySelection!.synchronize();
        await expect(gatewaySelection!.apply(sourceId)).rejects.toThrow(
          'was not reached through gateway',
        );

        // The mutation was compensated: the route through the tunnel is gone ...
        expect(await lab.routeGet(lab.destination)).not.toContain(lab.tunnelInterface);
        // ... and the tunnel interface was torn down.
        const interfaces = await lab.clientWireguard(['dump']).catch(() => '');
        expect(interfaces).not.toContain(lab.tunnelInterface);
      } finally {
        await rm(stateDirectory, { recursive: true, force: true });
        await lab.teardown();
      }
    },
    120_000,
  );
});
