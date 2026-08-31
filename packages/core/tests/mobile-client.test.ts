import { describe, expect, it, vi } from 'vitest';
import { createMobileClientState, MobileClientCore } from '../src/mobile-client.js';

describe('MobileClientCore', () => {
  it('creates a deterministic platform-neutral initial state', () => {
    expect(createMobileClientState('ios')).toEqual({
      platform: 'ios',
      connection: 'unknown',
      policy: { autonomousMode: false },
      revision: 0,
    });
  });

  it('rejects unsupported platforms', () => {
    expect(() => createMobileClientState('windows')).toThrow('Unsupported mobile platform: windows');
  });

  it('isolates policy state from returned objects', () => {
    const core = new MobileClientCore('android');
    const state = core.getState();
    state.policy.autonomousMode = true;
    expect(core.getState().policy.autonomousMode).toBe(false);
  });

  it('emits policy and snapshot events and advances revisions', async () => {
    const core = new MobileClientCore('ios');
    const events: string[] = [];
    core.subscribe((event) => events.push(event.type));

    core.setAutonomousMode(true);
    const snapshot = {
      platform: 'ios' as const,
      connection: 'online' as const,
      interfaceCount: 1,
      defaultRouteAvailable: true,
      dnsReachable: true,
      capturedAt: '2026-08-31T00:00:00.000Z',
    };
    await core.refresh({ snapshot: vi.fn().mockResolvedValue(snapshot) });

    expect(events).toEqual(['policy-changed', 'snapshot', 'connection-changed']);
    expect(core.getState().revision).toBe(2);
    expect(core.getState().connection).toBe('online');
  });

  it('rejects diagnostics from the wrong platform', async () => {
    const core = new MobileClientCore('android');
    await expect(
      core.refresh({
        snapshot: vi.fn().mockResolvedValue({
          platform: 'ios',
          connection: 'online',
          interfaceCount: 1,
          defaultRouteAvailable: true,
          dnsReachable: true,
          capturedAt: new Date().toISOString(),
        }),
      }),
    ).rejects.toThrow('Diagnostics platform mismatch: expected android, received ios');
  });

  it('preserves state when diagnostics fail', async () => {
    const core = new MobileClientCore('android');
    const before = core.getState();
    await expect(core.refresh({ snapshot: vi.fn().mockRejectedValue(new Error('adapter unavailable')) })).rejects.toThrow(
      'adapter unavailable',
    );
    expect(core.getState()).toEqual(before);
  });
});
