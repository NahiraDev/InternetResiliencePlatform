export type DataSource = 'LIVE' | 'DEMO' | 'UNAVAILABLE';
export type ConnectionState =
  'connected' | 'connecting' | 'disconnected' | 'degraded' | 'reconnecting' | 'unavailable';
export type StatusLevel = 'healthy' | 'degraded' | 'blocked' | 'unavailable';
export type DesktopEventName =
  | 'connectivity.changed'
  | 'route.changed'
  | 'dns.changed'
  | 'tunnel.changed'
  | 'security.state.changed'
  | 'security.violation.detected'
  | 'decision.completed'
  | 'notification.created';
export interface IpcError {
  code: string;
  message: string;
  recoverable: boolean;
}
export type IpcEnvelope<T> = { ok: true; data: T } | { ok: false; error: IpcError };
export interface EmptyRequest {
  readonly requestId?: string;
}
export interface NetworkStatusResponse {
  source: DataSource;
  connection: ConnectionState;
  currentRoute: string;
  interfaces: { name: string; state: string; latencyMs?: number; packetLossPct?: number }[];
  health: StatusLevel;
  updatedAt: string;
}
export interface SecurityStatusResponse {
  source: DataSource;
  state: StatusLevel;
  protectionState: string;
  killSwitch: string;
  violations: string[];
  routeLeak: StatusLevel;
  dnsLeak: StatusLevel;
  ipv6: string;
  explanation: string;
}
export interface TunnelStatusResponse {
  source: DataSource;
  activeTunnel: string | null;
  tunnels: {
    id: string;
    name: string;
    status: StatusLevel;
    endpoint: string;
    latencyMs?: number;
    durationSeconds?: number;
  }[];
}
export interface DnsStatusResponse {
  source: DataSource;
  resolver: string;
  secureTransport: string;
  health: StatusLevel;
  latencyMs?: number;
  policyStatus: string;
  leakStatus: StatusLevel;
}
export interface DecisionResponse {
  source: DataSource;
  recommendation: string;
  score: number;
  confidence: number;
  mode: 'deterministic' | 'statistical' | 'ML' | 'external AI';
  explanation: string;
  candidates: { name: string; score: number; accepted: boolean; reason: string }[];
  policyValidation: string;
  securityValidation: string;
  decisionAgeSeconds: number;
}
export interface SystemInfoResponse {
  source: DataSource;
  appVersion: string;
  platform: string;
  arch: string;
  backendStatus: ConnectionState;
  ipcStatus: 'registered' | 'unavailable';
  serviceVersions: Record<string, string>;
  lastErrors: string[];
}
export interface SettingsResponse {
  source: DataSource;
  sections: {
    name: string;
    settings: {
      key: string;
      value: string;
      consequence: string;
      securityCritical: boolean;
      requiresConfirmation: boolean;
    }[];
  }[];
}
export interface DiagnosticsExportResponse {
  source: DataSource;
  exportedAt: string;
  bundle: Record<string, unknown>;
  redacted: boolean;
}
export interface DemoScenarioRequest {
  scenario:
    | 'healthy'
    | 'degraded'
    | 'tunnel-failure'
    | 'dns-leak'
    | 'route-leak'
    | 'failover'
    | 'ai-recommendation';
}
export interface DesktopEvent {
  name: DesktopEventName;
  timestamp: string;
  source: DataSource;
  payload: Record<string, unknown>;
}
export const channels = {
  networkGetStatus: 'network:getStatus',
  securityGetStatus: 'security:getStatus',
  tunnelGetStatus: 'tunnel:getStatus',
  dnsGetStatus: 'dns:getStatus',
  aiGetDecision: 'ai:getDecision',
  systemGetInfo: 'system:getInfo',
  settingsGet: 'settings:get',
  diagnosticsExport: 'diagnostics:export',
  demoSetScenario: 'demo:setScenario',
  eventsSubscribe: 'events:subscribe',
} as const;
export type Channel = (typeof channels)[keyof typeof channels];
const emptyChannels = new Set<Channel>([
  channels.networkGetStatus,
  channels.securityGetStatus,
  channels.tunnelGetStatus,
  channels.dnsGetStatus,
  channels.aiGetDecision,
  channels.systemGetInfo,
  channels.settingsGet,
  channels.diagnosticsExport,
]);
export function validateRequest(channel: Channel, payload: unknown): IpcError | null {
  if (emptyChannels.has(channel))
    return payload === undefined ||
      (typeof payload === 'object' &&
        payload !== null &&
        Object.keys(payload).every((key) => key === 'requestId'))
      ? null
      : { code: 'IPC_VALIDATION', message: 'Malformed request payload', recoverable: true };
  if (channel === channels.demoSetScenario) {
    const scenarios = [
      'healthy',
      'degraded',
      'tunnel-failure',
      'dns-leak',
      'route-leak',
      'failover',
      'ai-recommendation',
    ];
    return typeof payload === 'object' &&
      payload !== null &&
      scenarios.includes(String((payload as { scenario?: unknown }).scenario))
      ? null
      : { code: 'IPC_VALIDATION', message: 'Invalid demo scenario', recoverable: true };
  }
  return { code: 'IPC_PERMISSION', message: 'Unknown IPC channel', recoverable: false };
}
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        /password|token|privateKey|credential|secret/i.test(k) ? k : k,
        /password|token|privateKey|credential|secret/i.test(k) ? '[REDACTED]' : redactSecrets(v),
      ]),
    );
  return value;
}
export function registeredDesktopChannels(): Channel[] {
  return Object.values(channels);
}
