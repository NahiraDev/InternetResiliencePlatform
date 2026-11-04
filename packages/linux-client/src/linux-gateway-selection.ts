/**
 * Linux gateway-selection composition.
 *
 * Wires the canonical gateway selection plane to the real Linux data plane:
 *
 * - the gateway endpoint comes from the configured WireGuard integration (a real host, a real
 *   port and a real credential reference read from the environment), never from a provider id
 *   or a default port;
 * - the tunnel is established through the canonical tunnel control plane, which performs a real
 *   WireGuard handshake;
 * - the route to the verified destination is installed through the tunnel interface with the
 *   canonical `RoutingEngine`;
 * - the destination is verified with the real Linux TCP probe, from the same network namespace
 *   the route is installed in.
 *
 * Trust is an explicit operator decision: a connectivity source only becomes a trusted gateway
 * when its id is listed in `IRP_GATEWAY_TRUSTED_SOURCE_IDS`. Nothing is trusted because it was
 * discovered.
 */

import { isIP } from 'node:net';
import type { ConnectivityManager } from '@irp/connectivity';
import type {
  CanonicalDestinationOutcome,
  GatewayEndpointResolver,
  GatewayRegistrySelectionPlane,
  RuntimeContext,
} from '@irp/resilience-runtime';
import type { RoutingDestination, RoutingEngine } from '@irp/routing';
import {
  GatewayRegistrySelectionPlane as CanonicalGatewaySelectionPlane,
} from '@irp/resilience-runtime';
import type { LinuxWireGuardConfiguration, LinuxWireGuardIntegration } from './linux-wireguard.js';
import { createLinuxDestinationVerifier } from './linux-destination-probe.js';

export interface LinuxGatewaySelectionOptions {
  /** The WireGuard integration that carries gateway traffic. */
  readonly tunnel?: LinuxWireGuardIntegration;
  /**
   * Connectivity source ids an operator explicitly trusts to act as a gateway.
   *
   * A source that is not listed stays `pending` and is never selected.
   */
  readonly trustedSourceIds?: readonly string[];
  /** The external destination that must be reached through the gateway. */
  readonly destination?: RoutingDestination;
  /** The canonical routing engine used to install the route through the tunnel. */
  readonly routing?: RoutingEngine;
  /** Network namespace the route and the probe operate in. */
  readonly netns?: string;
  /** Probe timeout for the external destination. */
  readonly destinationTimeoutMs?: number;
}

export interface LinuxGatewaySelectionEnvironment {
  readonly IRP_GATEWAY_SELECTION_ENABLED?: string;
  readonly IRP_GATEWAY_TRUSTED_SOURCE_IDS?: string;
  readonly IRP_GATEWAY_DESTINATION_HOST?: string;
  readonly IRP_GATEWAY_DESTINATION_PORT?: string;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parsePort(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer between 1 and 65535`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error(`${name} must be an integer between 1 and 65535`);
  return port;
}

/**
 * Parses the external destination that must be reachable through the gateway.
 *
 * The Linux probe connects to an IP literal: resolving a hostname would depend on the very DNS
 * state the runtime may be changing.
 */
export function parseGatewayDestination(
  host: string | undefined,
  port: string | undefined,
): RoutingDestination | undefined {
  if (!host?.trim() || !port?.trim()) return undefined;
  const trimmed = host.trim();
  if (isIP(trimmed) === 0)
    throw new Error('IRP_GATEWAY_DESTINATION_HOST must be an IP literal');
  const destinationPort = parsePort(port.trim(), 'IRP_GATEWAY_DESTINATION_PORT');
  return {
    kind: 'ip',
    value: trimmed,
    family: isIP(trimmed) === 6 ? 'ipv6' : 'ipv4',
    port: destinationPort,
  };
}

/**
 * Builds the endpoint resolver for the Linux gateway composition.
 *
 * The resolver is the only source of a gateway's host, port and tunnel declaration. It derives
 * them from the configured WireGuard integration, so a gateway can never be registered with a
 * provider id as its host, a default port or an invented address family.
 */
export function createLinuxGatewayEndpointResolver(
  configuration: LinuxWireGuardConfiguration,
): GatewayEndpointResolver {
  const family = isIP(configuration.endpointHost) === 6 ? 'ipv6' : 'ipv4';
  return (source) => ({
    host: configuration.endpointHost,
    port: configuration.endpointPort,
    family,
    tunnel: {
      protocol: 'wireguard',
      credentialRef: configuration.credentialRef,
      routingMode:
        configuration.tunnel.routingMode === 'fullTunnel' ? 'fullTunnel' : 'splitTunnel',
      addressCidr: configuration.addressCidr,
      allowedDestinations: [...configuration.allowedIPs],
      interfaceName: configuration.interfaceName,
      keepaliveSeconds: configuration.keepaliveSeconds,
    },
    capabilities: {
      transports: ['udp'],
      addressFamilies: [family],
      features: ['health-check'],
    },
    providerId: source.providerId,
    name: `WireGuard ${configuration.endpointHost}:${configuration.endpointPort}`,
    tags: ['wireguard'],
  });
}

/**
 * Builds the Linux gateway selection plane.
 *
 * Returns `undefined` when the composition is incomplete: without a tunnel integration, without
 * an explicitly trusted source or without a destination to verify, the plane would either invent
 * data or could not prove anything, so it is not created at all.
 */
export function createLinuxGatewaySelectionPlane(
  connectivity: ConnectivityManager,
  options: LinuxGatewaySelectionOptions,
): GatewayRegistrySelectionPlane | undefined {
  const tunnel = options.tunnel;
  const destination = options.destination;
  const trustedSourceIds = options.trustedSourceIds ?? [];
  if (!tunnel || !destination || trustedSourceIds.length === 0) return undefined;

  const configuration = tunnel.configuration;
  const verifyDestination = createLinuxDestinationVerifier({
    port: destination.port ?? 443,
    ...(options.destinationTimeoutMs === undefined
      ? {}
      : { timeoutMs: options.destinationTimeoutMs }),
    ...(options.netns ? { netns: options.netns } : {}),
  });

  return new CanonicalGatewaySelectionPlane(connectivity, {
    enabled: true,
    endpointResolver: createLinuxGatewayEndpointResolver(configuration),
    trustedGatewayIds: [...trustedSourceIds],
    tunnelControlPlane: tunnel.controlPlane,
    ...(options.routing ? { routing: options.routing } : {}),
    verifyDestination: verifyDestination as (
      destination: RoutingDestination,
      context: RuntimeContext,
    ) => Promise<CanonicalDestinationOutcome>,
    destination,
  });
}

/**
 * Reads the gateway-selection configuration from the environment.
 *
 * Every value is explicit: the operator enables the feature, names the trusted sources and
 * names the destination that has to be reachable through the tunnel.
 */
export function readLinuxGatewaySelectionEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): {
  readonly enabled: boolean;
  readonly trustedSourceIds: readonly string[];
  readonly destination: RoutingDestination | undefined;
} {
  const enabled = TRUE_VALUES.has((env.IRP_GATEWAY_SELECTION_ENABLED ?? '').trim().toLowerCase());
  const trustedSourceIds = (env.IRP_GATEWAY_TRUSTED_SOURCE_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const destination = parseGatewayDestination(
    env.IRP_GATEWAY_DESTINATION_HOST,
    env.IRP_GATEWAY_DESTINATION_PORT,
  );
  return { enabled, trustedSourceIds, destination };
}
