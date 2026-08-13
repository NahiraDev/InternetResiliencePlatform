import { ipcMain, BrowserWindow } from 'electron';
import {
  channels,
  redactSecrets,
  registeredDesktopChannels,
  validateRequest,
  type Channel,
  type DesktopEvent,
  type DemoScenarioRequest,
} from '../shared/ipc-contracts.js';
import { loadScenario, settings, systemInfo, type Scenario } from './demo-data.js';
import { log } from './logger.js';
let scenario: Scenario = 'healthy';
const allowlist = registeredDesktopChannels();
function envelope<T>(data: T) {
  return { ok: true as const, data };
}
function fail(code: string, message: string, recoverable = true) {
  return { ok: false as const, error: { code, message, recoverable } };
}
function broadcast(event: DesktopEvent) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('platform:event', event);
}
export function registeredChannels() {
  return allowlist;
}
export function registerIpc(appVersion: string) {
  const register = <T>(channel: Channel, handler: (payload: unknown) => T) =>
    ipcMain.handle(channel, (_event, payload) => {
      const err = validateRequest(channel, payload);
      if (err) {
        log('IPC', 'Rejected renderer request', { channel, error: err });
        return fail(err.code, err.message, err.recoverable);
      }
      try {
        log('IPC', 'Accepted renderer request', { channel });
        return envelope(handler(payload));
      } catch {
        return fail('BACKEND_UNAVAILABLE', 'Requested platform capability is unavailable', true);
      }
    });
  register(channels.networkGetStatus, () => loadScenario(scenario).network);
  register(channels.securityGetStatus, () => loadScenario(scenario).security);
  register(channels.tunnelGetStatus, () => loadScenario(scenario).tunnel);
  register(channels.dnsGetStatus, () => loadScenario(scenario).dns);
  register(channels.aiGetDecision, () => loadScenario(scenario).decision);
  register(channels.settingsGet, () => settings());
  register(channels.systemGetInfo, () => systemInfo(appVersion));
  register(channels.diagnosticsExport, () => ({
    source: 'DEMO',
    exportedAt: new Date().toISOString(),
    redacted: true,
    bundle: redactSecrets({
      system: systemInfo(appVersion),
      snapshot: loadScenario(scenario),
      token: 'example',
    }),
  }));
  register(channels.demoSetScenario, (payload) => {
    scenario = (payload as DemoScenarioRequest).scenario;
    const snapshot = loadScenario(scenario);
    broadcast({
      name: 'connectivity.changed',
      timestamp: new Date().toISOString(),
      source: 'DEMO',
      payload: { scenario, connection: snapshot.network.connection },
    });
    return snapshot;
  });
}
