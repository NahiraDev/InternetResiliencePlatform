import { describe, expect, it } from 'vitest';
import { DaemonConfigError, resolveControlSocketPath, resolveRuntimeMode, resolveStateDirectory } from './daemon-config.js';

describe('resolveRuntimeMode', () => {
  it('defaults to safe with no live mutation', () => {
    expect(resolveRuntimeMode({})).toEqual({ mode: 'safe', liveRouteMutation: false });
  });
  it('refuses live without the second opt-in', () => {
    expect(() => resolveRuntimeMode({ IRP_RUNTIME_MODE: 'live' })).toThrow(DaemonConfigError);
    expect(() => resolveRuntimeMode({ IRP_RUNTIME_MODE: 'live', IRP_ENABLE_LIVE_ROUTE_MUTATION: '1' })).toThrow(DaemonConfigError);
  });
  it('enables live only with both opt-ins', () => {
    expect(resolveRuntimeMode({ IRP_RUNTIME_MODE: 'live', IRP_ENABLE_LIVE_ROUTE_MUTATION: 'true' })).toEqual({ mode: 'live', liveRouteMutation: true });
  });
  it('does not enable live from the second flag alone', () => {
    expect(resolveRuntimeMode({ IRP_ENABLE_LIVE_ROUTE_MUTATION: 'true' }).liveRouteMutation).toBe(false);
  });
  it('rejects unknown modes', () => {
    expect(() => resolveRuntimeMode({ IRP_RUNTIME_MODE: 'yolo' })).toThrow(/safe, simulation or live/);
  });
});

describe('resolveStateDirectory / resolveControlSocketPath', () => {
  it('honours explicit overrides', () => {
    expect(resolveStateDirectory({ IRP_STATE_DIR: '/x' })).toBe('/x');
    expect(resolveControlSocketPath({ IRP_CONTROL_SOCKET: '/y.sock' })).toBe('/y.sock');
    expect(resolveControlSocketPath({ IRP_CONTROL_SOCKET: 'disabled' })).toBeUndefined();
  });
  it('uses system paths for root and per-user paths otherwise', () => {
    expect(resolveStateDirectory({}, { uid: 0 })).toBe('/var/lib/irp');
    expect(resolveControlSocketPath({}, { uid: 0 })).toBe('/run/irp/irp.sock');
    expect(resolveStateDirectory({ HOME: '/home/u' }, { uid: 1000 })).toBe('/home/u/.local/state/irp');
    expect(resolveControlSocketPath({ XDG_RUNTIME_DIR: '/run/user/1000' }, { uid: 1000 })).toBe('/run/user/1000/irp/irp.sock');
  });
  it('is off under test unless a directory is named', () => {
    expect(resolveStateDirectory({ VITEST: 'true' }, { uid: 0 })).toBeUndefined();
    expect(resolveControlSocketPath({ VITEST: 'true' }, { uid: 0 })).toBeUndefined();
  });
});
