/**
 * Production HTTP transport for the IRP Control Plane on macOS.
 *
 * Connects the macOS client to the IRP API over HTTP:
 *   - POST /api/v1/auth/remote/token              (device credential -> access + refresh token)
 *   - POST /api/v1/auth/remote/refresh            (rotate refresh token)
 *   - GET  /api/v1/remote/devices/:id/snapshot
 *   - GET  /api/v1/remote/devices/:id/analytics
 *   - GET  /api/v1/remote/devices/:id/policy
 *   - POST /api/v1/remote/devices/:id/policy
 *   - POST /api/v1/auth/remote/devices/request    (user-initiated enrollment request)
 *
 * Enrollment flow:
 *   1. User calls requestEnrollment() to create an enrollment request (pending admin approval).
 *   2. Admin approves the request via the API, which issues device credentials (credentialId + secret).
 *   3. Device receives credentials out-of-band and calls authenticateWithCredentials().
 *   4. Access token is used for data plane requests (snapshot, analytics, policy).
 *   5. On a 401 response, refresh is called once and the request is retried.
 *
 * Secure token storage: refresh tokens are persisted to a file with 0600 permissions
 * under the IRP state directory, so only the file's owner can read them.
 */
import { mkdirSync, openSync, writeSync, closeSync, chmodSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const CONNECT_TIMEOUT_MS = 8_000;
const READ_TIMEOUT_MS = 15_000;
const MAX_REFRESH_RETRIES = 1;

const jsonEncode = (value: unknown): string => JSON.stringify(value);
const jsonDecode = <T>(text: string): T => JSON.parse(text) as T;

const escapeJsonString = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');

const toJson = (any: unknown): string => {
  if (any === null) return 'null';
  if (typeof any === 'string') return `"${escapeJsonString(any)}"`;
  if (typeof any === 'number' || typeof any === 'boolean') return String(any);
  if (Array.isArray(any)) return `[${any.map(toJson).join(',')}]`;
  if (typeof any === 'object') {
    const fields: string[] = [];
    for (const [key, value] of Object.entries(any)) {
      fields.push(`"${escapeJsonString(key)}":${toJson(value)}`);
    }
    return `{${fields.join(',')}}`;
  }
  return String(any);
};

const parseConnection = (value: string): string => {
  switch (value.toLowerCase()) {
    case 'online': return 'online';
    case 'degraded': return 'degraded';
    case 'offline': return 'offline';
    default: return 'unknown';
  }
};

const parseInt = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
};

const parseDouble = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const parseInstant = (value: string | undefined): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * Secure token storage for macOS. Refresh tokens are persisted to a file with
 * 0600 permissions under the IRP state directory.
 */
class FileTokenStore {
  private readonly path: string;

  constructor(stateDirectory: string, filename: string) {
    this.path = join(stateDirectory, filename);
  }

  read(): string | undefined {
    if (!existsSync(this.path)) return undefined;
    try {
      return require('node:fs').readFileSync(this.path, 'utf8').trim() || undefined;
    } catch {
      return undefined;
    }
  }

  write(token: string): void {
    const dir = dirname(this.path);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const fd = openSync(this.path, 'w', 0o600);
    try {
      writeSync(fd, token);
    } finally {
      closeSync(fd);
    }
    chmodSync(this.path, 0o600);
  }

  remove(): void {
    try {
      require('node:fs').unlinkSync(this.path);
    } catch {
      // ignore if not present
    }
  }
}

/** Thrown when the control plane transport encounters an HTTP error. */
class ControlPlaneTransportError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number = 0) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ControlPlaneTransportError';
  }
}

const isUnauthorized = (error: unknown): boolean => {
  return error instanceof ControlPlaneTransportError && error.statusCode === 401;
};

/**
 * Production HTTP transport for the IRP Control Plane on macOS.
 */
export class HttpControlPlaneClient {
  private readonly baseUrl: string;
  private readonly tokenStore: FileTokenStore;

  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl: string, stateDirectory: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tokenStore = new FileTokenStore(stateDirectory, 'macos-client.refresh-token');
    this.refreshToken = this.tokenStore.read() ?? null;
  }

  getCurrentAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  signOut(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenStore.remove();
  }

  // ── Control plane operations ──────────────────────────────────────────

  async requestEnrollment(deviceName: string): Promise<{
    requestId: string;
    status: 'pending';
  }> {
    const body = toJson({ platform: 'macos', label: deviceName });
    const response = await this.request('POST', '/api/v1/auth/remote/devices/request', body, false);
    const data = response.data as Record<string, unknown>;
    return {
      requestId: String(data.requestId ?? ''),
      status: 'pending' as const,
    };
  }

  /**
   * Polls for enrollment request approval and returns device credentials.
   * Should be called after requestEnrollment() once admin has approved.
   */
  async getEnrollmentCredentials(requestId: string): Promise<{
    credentialId: string;
    deviceId: string;
    secret: string;
    expiresAt: string;
  } | null> {
    // This would require an admin-approval check endpoint
    // For now, the device uses authenticateWithCredentials with the credentialId/secret
    // received out-of-band after admin approval
    return null;
  }

  async snapshot(deviceId: string): Promise<{
    connection: string;
    interfaceCount: number;
    defaultRouteAvailable: boolean;
    dnsReachable: boolean;
    capturedAt: string;
  }> {
    const response = await this.request('GET', `/api/v1/remote/devices/${encodeURIComponent(deviceId)}/snapshot`, undefined, true);
    const data = response.data as Record<string, unknown>;
    return {
      connection: String(data.connection ?? 'unknown'),
      interfaceCount: parseInt(data.interfaceCount) ?? 0,
      defaultRouteAvailable: parseBoolean(data.defaultRouteAvailable) ?? false,
      dnsReachable: parseBoolean(data.dnsReachable) ?? false,
      capturedAt: String(data.capturedAt ?? new Date().toISOString()),
    };
  }

  async analytics(deviceId: string): Promise<{
    sampleCount: number;
    availabilityPercent: number;
    medianLatencyMs: number | null;
    packetLossPercent: number | null;
  }> {
    const response = await this.request('GET', `/api/v1/remote/devices/${encodeURIComponent(deviceId)}/analytics`, undefined, true);
    const data = response.data as Record<string, unknown>;
    return {
      sampleCount: parseInt(data.sampleCount) ?? 0,
      availabilityPercent: parseDouble(data.availabilityPercent) ?? 0.0,
      medianLatencyMs: parseDouble(data.medianLatencyMs) ?? null,
      packetLossPercent: parseDouble(data.packetLossPercent) ?? null,
    };
  }

  async setPolicy(deviceId: string, autonomousMode: boolean): Promise<{ autonomousMode: boolean }> {
    const body = toJson({ autonomousMode });
    const response = await this.request('POST', `/api/v1/remote/devices/${encodeURIComponent(deviceId)}/policy`, body, true);
    const data = response.data as Record<string, unknown>;
    return { autonomousMode: parseBoolean(data.autonomousMode) ?? autonomousMode };
  }

  // ── Authentication ─────────────────────────────────────────────────────

  async authenticateWithCredentials(credentialId: string, secret: string): Promise<void> {
    const body = toJson({ credentialId, secret });
    const response = await this.request('POST', '/api/v1/auth/remote/token', body, false);
    const data = response.data as Record<string, unknown>;
    const access = String(data.accessToken ?? '');
    const refresh = String(data.refreshToken ?? '');
    if (!access || !refresh) throw new ControlPlaneTransportError('Token response missing tokens', 502);
    this.accessToken = access;
    this.refreshToken = refresh;
    this.tokenStore.write(refresh);
  }

  async refresh(): Promise<boolean> {
    const current = this.refreshToken ?? this.tokenStore.read() ?? null;
    if (!current) return false;
    this.refreshToken = current;
    const body = toJson({ refreshToken: current });
    try {
      const response = await this.request('POST', '/api/v1/auth/remote/refresh', body, false);
      const data = response.data as Record<string, unknown>;
      this.accessToken = String(data.accessToken ?? '');
      this.refreshToken = String(data.refreshToken ?? '');
      if (this.refreshToken) this.tokenStore.write(this.refreshToken);
      return !!this.accessToken;
    } catch {
      return false;
    }
  }

  // ── Private networking ───────────────────────────────────────────────

  private async request(
    method: string,
    path: string,
    body: string | undefined,
    addAuth: boolean,
    refreshRetries: number = 0,
  ): Promise<{ data: unknown }> {
    const token = addAuth ? this.accessToken : null;
    const url = new URL(path, this.baseUrl).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(body ? { body } : {}),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseBody = await response.text();

      if (response.ok) {
        try {
          const parsed = jsonDecode(responseBody);
          // API wraps responses in { success: true, data: ... }
          const unwrapped =
            parsed && typeof parsed === 'object' && 'success' in parsed && parsed.success === true && 'data' in parsed
              ? parsed.data
              : parsed;
          return { data: unwrapped };
        } catch {
          return { data: {} };
        }
      }

      if (response.status === 401 && addAuth && refreshRetries < MAX_REFRESH_RETRIES) {
        const refreshed = await this.refresh();
        if (refreshed) {
          return this.request(method, path, body, true, refreshRetries + 1);
        }
      }

      throw new ControlPlaneTransportError(
        `HTTP ${response.status} for ${method} ${path}: ${responseBody}`,
        response.status,
      );
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ControlPlaneTransportError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ControlPlaneTransportError(`Request timeout for ${method} ${path}`, 408);
      }
      if (isUnauthorized(error)) throw error;
      throw new ControlPlaneTransportError(
        `Transport error for ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }
  }
}

export const createHttpControlPlaneClient = (
  baseUrl: string,
  stateDirectory: string,
): HttpControlPlaneClient => {
  return new HttpControlPlaneClient(baseUrl, stateDirectory);
};
