import type {
  DecisionResponse,
  DnsStatusResponse,
  NetworkStatusResponse,
  SecurityStatusResponse,
  TunnelStatusResponse,
  AutopilotStatusResponse,
} from '../shared/ipc-contracts.js';

export interface BackendPlatformStatus {
  source: 'LIVE';
  updatedAt: string;
  network: NetworkStatusResponse;
  security: SecurityStatusResponse;
  tunnel: TunnelStatusResponse;
  dns: DnsStatusResponse;
  decision: DecisionResponse;
  autopilot: AutopilotStatusResponse;
}

export class BackendConnector {
  private readonly baseUrl: string;
  private cached?: BackendPlatformStatus;
  private lastError: string | undefined;

  constructor(baseUrl = process.env.IRP_BACKEND_URL ?? 'http://127.0.0.1:8080') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async status(): Promise<BackendPlatformStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/platform/status`, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Backend status request failed with HTTP ${response.status}`);
      const body = (await response.json()) as { success?: boolean; data?: BackendPlatformStatus };
      if (!body.success || !body.data || body.data.source !== 'LIVE') {
        throw new Error('Backend status response did not contain LIVE platform data');
      }
      this.cached = body.data;
      this.lastError = undefined;
      return body.data;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown backend connector failure';
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  cache(): BackendPlatformStatus | undefined {
    return this.cached;
  }

  error(): string | undefined {
    return this.lastError;
  }
}
