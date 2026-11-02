import type { RouteDiscoveryProvider } from '@irp/routing';
import { constants as fsConstants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { TunnelProviderRegistry, type TunnelConfiguration } from '@irp/tunnel';
import { TunnelRegistryControlPlane } from '@irp/resilience-runtime';
import {
  WireGuardProvider,
  type CommandRunner,
  type WireGuardCredentialStore,
} from '@irp/tunnel/wireguard';
import { LinuxWireGuardRouteDiscoveryProvider } from './linux-wireguard-route-discovery.js';

const WIREGUARD_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const CREDENTIAL_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const INTERFACE_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,15}$/;
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export interface LinuxWireGuardConfiguration {
  readonly interfaceName: string;
  readonly credentialRef: string;
  readonly addressCidr: string;
  readonly endpointHost: string;
  readonly endpointPort: number;
  readonly peerPublicKey: string;
  readonly allowedIPs: readonly string[];
  readonly keepaliveSeconds: number;
  readonly tunnel: TunnelConfiguration;
}

export interface LinuxWireGuardIntegration {
  readonly provider: WireGuardProvider;
  readonly registry: TunnelProviderRegistry;
  readonly controlPlane: TunnelRegistryControlPlane;
  readonly routeDiscoveryProvider: RouteDiscoveryProvider;
  readonly configuration: LinuxWireGuardConfiguration;
}

export interface LinuxWireGuardIntegrationDependencies {
  readonly credentialStore?: WireGuardCredentialStore;
  readonly credentialsDirectory?: string;
  readonly commandRunner?: CommandRunner;
}

const required = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required when IRP_TUNNEL_ENABLED=1`);
  return value;
};

const parsePort = (value: string, name: string): number => {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer between 1 and 65535`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
};

const validateEndpointHost = (host: string): string => {
  if (host.length > 253 || /[\s/\\]/.test(host) || host.includes('[') || host.includes(']')) {
    throw new Error('IRP_WIREGUARD_ENDPOINT_HOST must be an IP literal or DNS hostname');
  }
  if (isIP(host) !== 0) return host;
  const labels = host.endsWith('.') ? host.slice(0, -1).split('.') : host.split('.');
  if (labels.length === 0 || labels.some((label) => label.length > 63 || !DOMAIN_LABEL_PATTERN.test(label))) {
    throw new Error('IRP_WIREGUARD_ENDPOINT_HOST must be an IP literal or DNS hostname');
  }
  return host;
};

const validateCidr = (value: string, name: string): string => {
  const parts = value.split('/');
  if (parts.length !== 2 || !parts[0] || !/^\d+$/.test(parts[1] ?? '')) {
    throw new Error(`${name} must contain valid CIDR entries`);
  }
  const family = isIP(parts[0]);
  const prefix = Number(parts[1]);
  const maxPrefix = family === 4 ? 32 : family === 6 ? 128 : -1;
  if (maxPrefix < 0 || !Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
    throw new Error(`${name} must contain valid CIDR entries`);
  }
  return `${parts[0]}/${prefix}`;
};

export function parseLinuxWireGuardConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): LinuxWireGuardConfiguration {
  const endpointHost = validateEndpointHost(required(env, 'IRP_WIREGUARD_ENDPOINT_HOST'));
  const endpointPort = parsePort(required(env, 'IRP_WIREGUARD_ENDPOINT_PORT'), 'IRP_WIREGUARD_ENDPOINT_PORT');
  const peerPublicKey = required(env, 'IRP_WIREGUARD_PEER_PUBLIC_KEY');
  if (!WIREGUARD_KEY_PATTERN.test(peerPublicKey)) {
    throw new Error('IRP_WIREGUARD_PEER_PUBLIC_KEY must be a valid WireGuard public key');
  }

  const credentialRef = required(env, 'IRP_WIREGUARD_CREDENTIAL_REF');
  if (!CREDENTIAL_REFERENCE_PATTERN.test(credentialRef)) {
    throw new Error('IRP_WIREGUARD_CREDENTIAL_REF must be a simple systemd credential name');
  }

  const interfaceName = env.IRP_WIREGUARD_INTERFACE_NAME?.trim() || 'irpwg0';
  if (!INTERFACE_NAME_PATTERN.test(interfaceName)) {
    throw new Error('IRP_WIREGUARD_INTERFACE_NAME must be a Linux interface name of at most 15 characters');
  }

  const addressCidr = validateCidr(required(env, 'IRP_WIREGUARD_ADDRESS_CIDR'), 'IRP_WIREGUARD_ADDRESS_CIDR');
  const allowedIPs = required(env, 'IRP_WIREGUARD_ALLOWED_IPS')
    .split(',')
    .map((value) => validateCidr(value.trim(), 'IRP_WIREGUARD_ALLOWED_IPS'));
  if (allowedIPs.length === 0 || allowedIPs.length > 64 || new Set(allowedIPs).size !== allowedIPs.length) {
    throw new Error('IRP_WIREGUARD_ALLOWED_IPS must contain between 1 and 64 unique CIDR entries');
  }
  if (allowedIPs.includes('0.0.0.0/0') || allowedIPs.includes('::/0')) {
    throw new Error('Default-route AllowedIPs require the separate full-tunnel route/egress integration');
  }

  // This integration increment deliberately exposes split-tunnel peer configuration only.
  // Full-tunnel host routing waits for the separate route/egress integration.
  const routingMode = env.IRP_WIREGUARD_ROUTING_MODE?.trim() || 'splitTunnel';
  if (routingMode !== 'splitTunnel') {
    throw new Error('IRP_WIREGUARD_ROUTING_MODE supports splitTunnel only; fullTunnel requires the separate route/egress integration');
  }

  const keepaliveRaw = env.IRP_WIREGUARD_KEEPALIVE_SECONDS?.trim() || '25';
  if (!/^\d+$/.test(keepaliveRaw)) {
    throw new Error('IRP_WIREGUARD_KEEPALIVE_SECONDS must be an integer between 0 and 65535');
  }
  const keepaliveSeconds = Number(keepaliveRaw);
  if (!Number.isInteger(keepaliveSeconds) || keepaliveSeconds < 0 || keepaliveSeconds > 65_535) {
    throw new Error('IRP_WIREGUARD_KEEPALIVE_SECONDS must be an integer between 0 and 65535');
  }

  const keepaliveMs = keepaliveSeconds * 1_000;
  const tunnel: TunnelConfiguration = {
    endpoint: {
      host: endpointHost,
      port: endpointPort,
      protocol: 'wireguard',
      addressFamily: isIP(endpointHost) === 4 ? 'ipv4' : isIP(endpointHost) === 6 ? 'ipv6' : 'dual',
      metadata: {},
    },
    routingMode: 'splitTunnel',
    splitTunnel: {
      includedDestinations: [...allowedIPs],
      excludedDestinations: [],
      precedence: 'include',
    },
    scope: 'system',
    dnsMode: 'resolverDecision',
    authentication: { type: 'key', credentialRef },
    credentialRef,
    securityProfile: 'strict',
    capabilities: [
      'ipv4', 'ipv6', 'udp', 'splitRouting', 'systemWide',
      'authentication', 'keepalive', 'reconnect', 'healthCheck', 'killSwitch',
    ],
    keepalive: { enabled: keepaliveSeconds > 0, intervalMs: keepaliveMs, timeoutMs: 5_000 },
    mtu: { validationStatus: 'unknown' },
    timeoutMs: 30_000,
    retryLimit: 1,
  };

  return {
    interfaceName,
    credentialRef,
    addressCidr,
    endpointHost,
    endpointPort,
    peerPublicKey,
    allowedIPs,
    keepaliveSeconds,
    tunnel,
  };
}

/**
 * Reads the private key from systemd LoadCredential, never from process env.
 * References are basenames; files must be regular, non-symlink and private.
 */
export class SystemdWireGuardCredentialStore implements WireGuardCredentialStore {
  private readonly credentialsDirectory: string;

  constructor(credentialsDirectory = process.env.CREDENTIALS_DIRECTORY) {
    const directory = credentialsDirectory?.trim();
    if (!directory) {
      throw new Error('WireGuard is enabled but CREDENTIALS_DIRECTORY is unavailable; configure systemd LoadCredential');
    }
    this.credentialsDirectory = directory;
  }

  async getPrivateKey(credentialRef: string): Promise<string> {
    if (!CREDENTIAL_REFERENCE_PATTERN.test(credentialRef)) {
      throw new Error('WireGuard credential reference is invalid');
    }

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const root = await realpath(this.credentialsDirectory);
      handle = await open(join(root, credentialRef), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const stats = await handle.stat();
      if (!stats.isFile()) throw new Error('WireGuard credential must be a regular file');
      if ((stats.mode & 0o077) !== 0) {
        throw new Error('WireGuard credential permissions must deny group and other access');
      }
      if (stats.size > 128) throw new Error('WireGuard credential file is too large');
      const privateKey = (await handle.readFile({ encoding: 'utf8' })).trim();
      if (!WIREGUARD_KEY_PATTERN.test(privateKey)) {
        throw new Error('WireGuard credential does not contain a valid private key');
      }
      return privateKey;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('WireGuard credential')) throw error;
      throw new Error('WireGuard credential "' + credentialRef + '" is unavailable or unsafe', { cause: error });
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
}

export function createLinuxWireGuardIntegrationFromEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: LinuxWireGuardIntegrationDependencies = {},
): LinuxWireGuardIntegration | undefined {
  const enabled = env.IRP_TUNNEL_ENABLED;
  if (enabled === undefined || enabled === '0') return undefined;
  if (enabled !== '1') {
    throw new Error('IRP_TUNNEL_ENABLED must be exactly 0 or 1');
  }

  const configuration = parseLinuxWireGuardConfiguration(env);
  const credentialStore =
    dependencies.credentialStore ??
    new SystemdWireGuardCredentialStore(dependencies.credentialsDirectory ?? env.CREDENTIALS_DIRECTORY);
  const provider = new WireGuardProvider({
    credentialStore,
    ...(dependencies.commandRunner ? { commandRunner: dependencies.commandRunner } : {}),
    interfaceName: configuration.interfaceName,
    addressCidr: configuration.addressCidr,
    peer: {
      publicKey: configuration.peerPublicKey,
      allowedIPs: [...configuration.allowedIPs],
      persistentKeepalive: configuration.keepaliveSeconds,
    },
  });
  const registry = new TunnelProviderRegistry();
  registry.register(provider);
  const controlPlane = new TunnelRegistryControlPlane(registry, {
    enabled: true,
    providerId: provider.id,
    configuration: configuration.tunnel,
    killSwitchOptions: {
      tunnelInterface: configuration.interfaceName,
      allowedUdpPorts: [configuration.endpointPort],
    },
  });

  const routeDiscoveryProvider = new LinuxWireGuardRouteDiscoveryProvider({
    controlPlane,
    interfaceName: configuration.interfaceName,
    allowedIPs: configuration.allowedIPs,
    failureDomain: 'wireguard:' + configuration.endpointHost + ':' + configuration.endpointPort,
  });

  return { provider, registry, controlPlane, routeDiscoveryProvider, configuration };
}
