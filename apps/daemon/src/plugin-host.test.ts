import { describe, expect, it } from 'vitest';
import { builtinPlugins } from '@irp/plugin-samples';
import { PluginHost } from './plugin-host.js';

describe('PluginHost', () => {
  it('starts installed plugins and reports their state', async () => {
    const host = new PluginHost(builtinPlugins());
    expect(host.isRunning).toBe(false);
    expect(host.status()).toEqual({ loaded: [], active: [] });

    await host.start();
    expect(host.isRunning).toBe(true);
    const status = host.status();
    expect(status.loaded).toEqual(
      expect.arrayContaining([
        'builtin.dns.provider',
        'builtin.vpn.provider',
        'builtin.notification.provider',
      ]),
    );
    expect(status.active).toEqual(
      expect.arrayContaining(['builtin.dns.provider']),
    );

    await host.stop();
    expect(host.isRunning).toBe(false);
  });

  it('is a safe no-op without plugins', async () => {
    const host = new PluginHost([]);
    await host.start();
    expect(host.isRunning).toBe(true);
    expect(host.status()).toEqual({ loaded: [], active: [] });
    await host.stop();
  });
});