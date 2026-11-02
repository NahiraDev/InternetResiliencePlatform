import type {
  CanonicalTunnelControlPlane,
  Observation,
  ObservationProvider,
  ObservationProviderResult,
  RuntimeContext,
} from '@irp/resilience-runtime';

/**
 * Converts the managed WireGuard provider's handshake state into canonical
 * observations. It never connects or mutates the tunnel; a separate
 * tunnel_switch candidate must pass hostTrust, policy, capability and
 * privileged-mutation validation before the canonical tunnel adapter runs.
 */
export interface LinuxWireGuardObservationProviderOptions {
  readonly controlPlane: Pick<
    CanonicalTunnelControlPlane,
    'configured' | 'activeTunnel' | 'managedTunnel' | 'verify'
  >;
  readonly autoConnect: boolean;
  readonly maxRecoveryAttempts?: number;
}

export class LinuxWireGuardObservationProvider implements ObservationProvider {
  readonly id = 'linux-wireguard-runtime';
  private initialConnectReported = false;
  private recoveryAttempts = 0;
  private readonly maxRecoveryAttempts: number;

  constructor(private readonly options: LinuxWireGuardObservationProviderOptions) {
    this.maxRecoveryAttempts = options.maxRecoveryAttempts ?? 2;
    if (!Number.isInteger(this.maxRecoveryAttempts) || this.maxRecoveryAttempts < 1 || this.maxRecoveryAttempts > 5) {
      throw new RangeError('maxRecoveryAttempts must be an integer between 1 and 5');
    }
  }

  async collect(context: RuntimeContext): Promise<ObservationProviderResult> {
    const collectedAt = new Date().toISOString();
    if (!this.options.controlPlane.configured) {
      return { providerId: this.id, observations: [], collectedAt, errors: [] };
    }

    const tunnelId = this.options.controlPlane.managedTunnel;
    if (tunnelId === undefined) {
      if (!this.options.autoConnect || this.initialConnectReported) {
        return { providerId: this.id, observations: [], collectedAt, errors: [] };
      }
      this.initialConnectReported = true;
      return {
        providerId: this.id,
        collectedAt,
        errors: [],
        observations: [
          this.observation(context, collectedAt, {
            metric: 'wireguard_autoconnect',
            value: 0,
            status: 'degraded',
            severity: 'warning',
            metadata: { reconnect: false },
          }),
        ],
      };
    }

    let healthy = false;
    if (this.options.controlPlane.activeTunnel === tunnelId) {
      try {
        healthy = await this.options.controlPlane.verify(tunnelId);
      } catch {
        healthy = false;
      }
    }

    if (healthy) {
      this.initialConnectReported = true;
      this.recoveryAttempts = 0;
      return {
        providerId: this.id,
        collectedAt,
        errors: [],
        observations: [
          this.observation(context, collectedAt, {
            metric: 'wireguard_handshake',
            value: 1,
            status: 'healthy',
            severity: 'info',
            metadata: { tunnelId, reconnect: false },
          }),
        ],
      };
    }

    const recoveryExhausted = this.recoveryAttempts >= this.maxRecoveryAttempts;
    if (!recoveryExhausted) this.recoveryAttempts += 1;
    return {
      providerId: this.id,
      collectedAt,
      errors: [],
      observations: [
        this.observation(context, collectedAt, {
          metric: 'wireguard_handshake',
          value: 0,
          status: 'failed',
          severity: 'critical',
          metadata: {
            tunnelId,
            reconnect: true,
            ...(recoveryExhausted ? { recoveryExhausted: true } : {}),
            recoveryAttempt: this.recoveryAttempts,
          },
        }),
      ],
    };
  }

  private observation(
    context: RuntimeContext,
    timestamp: string,
    input: {
      readonly metric: string;
      readonly value: number;
      readonly status: Observation['status'];
      readonly severity: Observation['severity'];
      readonly metadata: Readonly<Record<string, unknown>>;
    },
  ): Observation {
    return {
      id: this.id + '-' + input.metric + '-' + context.correlationId,
      schemaVersion: 1,
      createdAt: timestamp,
      correlationId: context.correlationId,
      source: this.id,
      metadata: {
        tunnelProviderId: 'wireguard',
        ...input.metadata,
      },
      category: 'tunnel',
      metric: input.metric,
      value: input.value,
      timestamp,
      freshnessMs: 0,
      confidence: 0.98,
      severity: input.severity,
      status: input.status,
    };
  }
}
