import type {
  Tunnel,
  TunnelConfiguration,
  TunnelHealth,
  TunnelProvider,
  TunnelState,
} from './index.js';
import { tunnelErrors, transitionTunnel, validateTunnelConfiguration } from './index.js';

export type SecureTunnelOperation = 'connect' | 'disconnect' | 'healthCheck';

export interface SecureTunnelOperationContext {
  operation: SecureTunnelOperation;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface SecureTunnelOperationResult<T> {
  value: T;
  elapsedMs: number;
}

/**
 * Phase 48 security boundary for provider-neutral tunnel operations.
 * It validates provider compatibility, enforces bounded operation time and
 * never stores credential material.
 */
export function validateProviderCompatibility(
  provider: TunnelProvider,
  config: TunnelConfiguration,
): void {
  validateTunnelConfiguration(config);

  if (provider.protocol !== config.endpoint.protocol) {
    throw tunnelErrors.capability('Provider protocol does not match tunnel configuration', {
      providerId: provider.id,
      providerProtocol: provider.protocol,
      requestedProtocol: config.endpoint.protocol,
    });
  }

  if (!provider.endpoints.some((endpoint) => endpoint.host === config.endpoint.host && endpoint.port === config.endpoint.port)) {
    throw tunnelErrors.policy('Tunnel endpoint is not advertised by the provider', {
      providerId: provider.id,
      endpoint: config.endpoint.host,
    });
  }

  if (!provider.supportedScopes.includes(config.scope)) {
    throw tunnelErrors.capability('Provider does not support requested tunnel scope', {
      providerId: provider.id,
      scope: config.scope,
    });
  }

  if (!provider.supportedRoutingModes.includes(config.routingMode)) {
    throw tunnelErrors.capability('Provider does not support requested routing mode', {
      providerId: provider.id,
      routingMode: config.routingMode,
    });
  }

  const missing = config.capabilities.filter((capability) => !provider.capabilities.includes(capability));
  if (missing.length > 0) {
    throw tunnelErrors.capability('Provider is missing required tunnel capabilities', {
      providerId: provider.id,
      missingCapabilities: missing,
    });
  }
}

export function assertSecureLifecycleTransition(tunnel: Tunnel, next: TunnelState): Tunnel {
  return transitionTunnel(tunnel, next);
}

export async function withSecureTunnelTimeout<T>(
  operation: (context: SecureTunnelOperationContext) => Promise<T>,
  operationType: SecureTunnelOperation,
  timeoutMs: number,
): Promise<SecureTunnelOperationResult<T>> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
    throw tunnelErrors.configuration('Tunnel operation timeout must be between 1000 and 300000 milliseconds', {
      operation: operationType,
      timeoutMs,
    });
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const value = await Promise.race([
      operation({ operation: operationType, timeoutMs, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error(`${operationType} timed out`));
          reject(tunnelErrors.dependency(`Tunnel ${operationType} timed out`, { operation: operationType, timeoutMs }));
        }, timeoutMs);
      }),
    ]);
    return { value, elapsedMs: Date.now() - startedAt };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

export function validateTunnelHealthEvidence(health: TunnelHealth, nowMs = Date.now()): void {
  const checkedAtMs = Date.parse(health.checkedAt);
  if (!Number.isFinite(checkedAtMs)) throw tunnelErrors.configuration('Tunnel health timestamp is invalid');
  if (checkedAtMs > nowMs + 5_000) throw tunnelErrors.configuration('Tunnel health timestamp cannot be materially in the future');
  if (health.latencyMs !== undefined && (!Number.isFinite(health.latencyMs) || health.latencyMs < 0)) {
    throw tunnelErrors.configuration('Tunnel health latency must be non-negative');
  }
  if (health.packetLoss !== undefined && (!Number.isFinite(health.packetLoss) || health.packetLoss < 0 || health.packetLoss > 100)) {
    throw tunnelErrors.configuration('Tunnel health packet loss must be between 0 and 100 percent');
  }
  if (health.status === 'healthy' && (!health.connectivity || !health.authenticated || !health.routeReachable)) {
    throw tunnelErrors.configuration('Healthy tunnel evidence is internally inconsistent');
  }
}
