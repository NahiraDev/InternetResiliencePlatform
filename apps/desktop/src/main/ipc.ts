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
import { BackendConnector } from './backend-connector.js';
import { loadScenario, settings, systemInfo, type Scenario } from './demo-data.js';
import { log } from './logger.js';
let scenario: Scenario = 'healthy';
const mode = (process.env.IRP_DESKTOP_MODE ?? 'LIVE').toUpperCase() === 'DEMO' ? 'DEMO' : 'LIVE';
const connector = new BackendConnector();
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
async function platformStatus() {
  if (mode === 'DEMO') return loadScenario(scenario);
  return connector.status();
}
export function registeredChannels() {
  return allowlist;
}
export function registerIpc(appVersion: string) {
  const register = <T>(channel: Channel, handler: (payload: unknown) => T | Promise<T>) =>
    ipcMain.handle(channel, async (_event, payload) => {
      const err = validateRequest(channel, payload);
      if (err) {
        log('IPC', 'Rejected renderer request', { channel, error: err });
        return fail(err.code, err.message, err.recoverable);
      }
      try {
        log('IPC', 'Accepted renderer request', { channel });
        return envelope(await handler(payload));
      } catch (error) {
        log('IPC', 'Backend connector failed', { channel, error: String(error) });
        return fail('BACKEND_UNAVAILABLE', 'Requested platform capability is unavailable', true);
      }
    });
  register(channels.networkGetStatus, async () => (await platformStatus()).network);
  register(channels.securityGetStatus, async () => (await platformStatus()).security);
  register(channels.tunnelGetStatus, async () => (await platformStatus()).tunnel);
  register(channels.dnsGetStatus, async () => (await platformStatus()).dns);
  register(channels.aiGetDecision, async () => (await platformStatus()).decision);
  register(channels.settingsGet, () => settings(mode));
  register(channels.systemGetInfo, () => ({
    ...systemInfo(appVersion, mode),
    backendStatus: connector.cache() ? 'connected' : mode === 'DEMO' ? 'unavailable' : 'connecting',
    lastErrors: connector.error() ? [connector.error() as string] : [],
  }));
  register(channels.diagnosticsExport, async () => ({
    source: mode,
    exportedAt: new Date().toISOString(),
    redacted: true,
    bundle: redactSecrets({
      system: systemInfo(appVersion, mode),
      snapshot: await platformStatus(),
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
