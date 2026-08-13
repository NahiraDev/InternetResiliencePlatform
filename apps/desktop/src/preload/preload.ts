import { contextBridge, ipcRenderer } from 'electron';
import { channels, type DemoScenarioRequest, type DesktopEvent } from '../shared/ipc-contracts.js';
import type {
  IpcEnvelope,
  NetworkStatusResponse,
  SecurityStatusResponse,
  TunnelStatusResponse,
  DnsStatusResponse,
  DecisionResponse,
  SystemInfoResponse,
  SettingsResponse,
  DiagnosticsExportResponse,
} from '../shared/ipc-contracts.js';
const invoke = <T>(channel: string, payload: unknown = {}) =>
  ipcRenderer.invoke(channel, payload) as Promise<IpcEnvelope<T>>;
const platform = {
  network: { getStatus: () => invoke<NetworkStatusResponse>(channels.networkGetStatus) },
  security: { getStatus: () => invoke<SecurityStatusResponse>(channels.securityGetStatus) },
  tunnel: { getStatus: () => invoke<TunnelStatusResponse>(channels.tunnelGetStatus) },
  dns: { getStatus: () => invoke<DnsStatusResponse>(channels.dnsGetStatus) },
  ai: { getDecision: () => invoke<DecisionResponse>(channels.aiGetDecision) },
  system: { getInfo: () => invoke<SystemInfoResponse>(channels.systemGetInfo) },
  settings: { get: () => invoke<SettingsResponse>(channels.settingsGet) },
  diagnostics: { export: () => invoke<DiagnosticsExportResponse>(channels.diagnosticsExport) },
  demo: {
    setScenario: (scenario: DemoScenarioRequest['scenario']) =>
      invoke<unknown>(channels.demoSetScenario, { scenario }),
  },
  events: {
    subscribe: (listener: (event: DesktopEvent) => void) => {
      const wrapped = (_: unknown, event: unknown) => listener(event as DesktopEvent);
      ipcRenderer.on('platform:event', wrapped);
      return () => ipcRenderer.removeListener('platform:event', wrapped);
    },
  },
};
contextBridge.exposeInMainWorld('platform', platform);
export type PlatformBridge = typeof platform;
