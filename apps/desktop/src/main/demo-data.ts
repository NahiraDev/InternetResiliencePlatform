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
}
const root = new URL('../../../..', import.meta.url).pathname;
export function loadScenario(scenario: Scenario): Snapshot {
  return JSON.parse(
    readFileSync(join(root, 'examples/phase-20', `${scenario}.json`), 'utf8'),
  ) as Snapshot;
}
export function settings(): SettingsResponse {
  return {
    source: 'DEMO',
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
export function systemInfo(appVersion: string): SystemInfoResponse {
  return {
    source: 'DEMO',
    appVersion,
    platform: process.platform,
    arch: process.arch,
    backendStatus: 'unavailable',
    ipcStatus: 'registered',
    serviceVersions: { desktop: appVersion },
    lastErrors: ['Backend control API not detected; demo fixture provider active.'],
  };
}
