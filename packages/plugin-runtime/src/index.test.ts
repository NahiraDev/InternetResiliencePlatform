import { describe, expect, it } from 'vitest';
import { PluginRuntime } from './index.js';
import type { InternetResiliencePlugin, PluginManifest } from '@irp/plugin-sdk';
const manifest = (
  id = 'runtime.plugin',
  permissions: PluginManifest['permissions'] = [],
): PluginManifest => ({
  id,
  name: id,
  displayName: id,
  version: '1.0.0',
  description: 'test',
  author: 'IRP',
  license: 'Apache-2.0',
  engineVersion: '^0.1.0',
  minimumPlatformVersion: '0.1.0',
  permissions,
  dependencies: [],
  optionalDependencies: [],
  entry: 'dist/index.js',
  activationEvents: ['onStartup'],
  capabilities: ['health-checker'],
  configurationSchema: {
    type: 'object',
    properties: { enabled: { type: 'boolean', default: true } },
    required: ['enabled'],
  },
});
describe('PluginRuntime lifecycle', () => {
  it('installs, initializes, activates, publishes activation, and cleans up uninstall', async () => {
    const calls: string[] = [];
    const plugin: InternetResiliencePlugin = {
      manifest: manifest(),
      install: (c) => {
        calls.push(`install:${c.config.get().enabled}`);
      },
      initialize: () => {
        calls.push('init');
      },
      activate: () => {
        calls.push('activate');
      },
      uninstall: () => {
        calls.push('uninstall');
      },
    };
    const runtime = new PluginRuntime();
    const events: unknown[] = [];
    runtime.events.subscribe('plugin.activated', (e) => {
      events.push(e.payload);
    });
    await runtime.install(plugin);
    await runtime.initialize(plugin.manifest.id);
    await runtime.activate(plugin.manifest.id);
    expect(runtime.status(plugin.manifest.id)).toBe('active');
    expect(events).toEqual([{ id: plugin.manifest.id }]);
    await runtime.uninstall(plugin.manifest.id);
    expect(calls).toEqual(['install:true', 'init', 'activate', 'uninstall']);
    expect(() => runtime.status(plugin.manifest.id)).toThrow('Plugin not registered');
  });
  it('marks activation failures as failed and increments crash count', async () => {
    const runtime = new PluginRuntime();
    const plugin: InternetResiliencePlugin = {
      manifest: manifest('bad'),
      activate: () => {
        throw new Error('boom');
      },
    };
    await runtime.install(plugin);
    await expect(runtime.activate('bad')).rejects.toThrow('boom');
    expect(runtime.registry.get('bad').status).toBe('failed');
    expect(runtime.registry.get('bad').health).toMatchObject({
      status: 'unhealthy',
      crashCount: 1,
      message: 'boom',
    });
  });
  it('enforces permissions through runtime context sandbox', async () => {
    const runtime = new PluginRuntime();
    const plugin: InternetResiliencePlugin = {
      manifest: manifest('limited'),
      validate: (c) => c.requirePermission('vpn.connect'),
    };
    await runtime.install(plugin);
    await expect(runtime.validate('limited')).rejects.toThrow('Plugin limited lacks vpn.connect');
  });
});
