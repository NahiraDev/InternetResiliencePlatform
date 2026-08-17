import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DecisionResponse,
  DnsStatusResponse,
  NetworkStatusResponse,
  SecurityStatusResponse,
  SettingsResponse,
  SystemInfoResponse,
  TunnelStatusResponse,
  DataSource,
  AutopilotStatusResponse,
} from '../shared/ipc-contracts.js';
export type Scenario =
  | 'healthy'
  | 'degraded'
  | 'tunnel-failure'
  | 'dns-leak'
  | 'route-leak'
  | 'failover'
  | 'ai-recommendation';
export interface Snapshot {
  network: NetworkStatusResponse;
  security: SecurityStatusResponse;
  tunnel: TunnelStatusResponse;
  dns: DnsStatusResponse;
  decision: DecisionResponse;
  autopilot: AutopilotStatusResponse;
}
const root = new URL('../../../..', import.meta.url).pathname;
export function loadScenario(scenario: Scenario): Snapshot {
  const base = JSON.parse(
    readFileSync(join(root, 'examples/phase-20', `${scenario}.json`), 'utf8'),
  ) as Omit<Snapshot, 'autopilot'>;
  return {
    ...base,
    autopilot: {
      source: 'DEMO',
      enabled: false,
      mode: 'OBSERVE_ONLY',
      circuitBreaker: 'CLOSED',
      activeIncidents: scenario === 'healthy' ? 0 : 1,
      pendingApprovals: scenario === 'healthy' ? 0 : 1,
      activeActions: 0,
      verificationState: 'UNKNOWN',
      rollbackState: 'NOT_REQUIRED',
      recentOutcomes: scenario === 'healthy' ? ['NOOP'] : ['SHADOW'],
    },
  };
}
export function settings(source: DataSource = 'DEMO'): SettingsResponse {
  return {
    source,
    sections: [
      'General',
      'Network',
      'Security',
      'DNS',
      'Tunnel',
      'AI',
      'Privacy',
      'Diagnostics',
    ].map((name) => ({
      name,
      settings: [
        {
          key: `${name.toLowerCase()}.mode`,
          value: 'observe-only',
          consequence: 'No host networking changes are made from the desktop client.',
          securityCritical: ['Security', 'DNS', 'Tunnel', 'Network'].includes(name),
          requiresConfirmation: ['Security', 'DNS', 'Tunnel', 'Network'].includes(name),
        },
      ],
    })),
  };
}
export function systemInfo(appVersion: string, source: DataSource = 'DEMO'): SystemInfoResponse {
  return {
    source,
    appVersion,
    platform: process.platform,
    arch: process.arch,
    backendStatus: 'unavailable',
    ipcStatus: 'registered',
    serviceVersions: { desktop: appVersion },
    lastErrors: source === 'DEMO' ? ['Demo fixture provider active.'] : [],
  };
}
