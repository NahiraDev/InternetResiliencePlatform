import { describe, expect, it } from 'vitest';
import { builtinPlugins, SampleDnsProvider } from './index.js';
describe('plugin samples', () => {
  it('exposes runtime-loadable sample plugins with truthful manifests', () => {
    const plugins = builtinPlugins();
    expect(plugins).toHaveLength(5);
    expect(new Set(plugins.map((p) => p.manifest.id)).size).toBe(5);
    expect(plugins.map((p) => p.manifest.capabilities[0])).toEqual([
      'dns-provider',
      'vpn-provider',
      'notification-provider',
      'metrics-exporter',
      'health-checker',
    ]);
  });
  it('sample DNS provider reports healthy after initialization', () => {
    const plugin = new SampleDnsProvider();
    plugin.initialize({
      manifest: plugin.manifest,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      events: {} as never,
      config: {} as never,
      api: {} as never,
      requirePermission() {},
    });
    expect(plugin.health()).toMatchObject({
      status: 'healthy',
      message: 'builtin.dns.provider ready',
    });
  });
});
