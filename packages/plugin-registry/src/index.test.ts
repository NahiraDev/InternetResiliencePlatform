import { describe, expect, it } from 'vitest';
import { PluginRegistry } from './index.js';
import type { PluginManifest } from '@irp/plugin-sdk';
const manifest = (id = 'test.plugin', extra: Partial<PluginManifest> = {}): PluginManifest => ({
  id,
  name: id,
  displayName: id,
  version: '1.0.0',
  description: 'test',
  author: 'IRP',
  license: 'Apache-2.0',
  engineVersion: '^0.1.0',
  minimumPlatformVersion: '0.1.0',
  permissions: [],
  dependencies: [{ id: 'dep', version: '^1.0.0' }],
  optionalDependencies: [],
  entry: 'dist/index.js',
  activationEvents: ['onStartup'],
  capabilities: ['health-checker'],
  ...extra,
});
describe('PluginRegistry', () => {
  it('registers lookup metadata, preserves dependency metadata, and rejects duplicates', () => {
    const registry = new PluginRegistry();
    const rec = registry.install(manifest());
    expect(rec.status).toBe('installed');
    expect(registry.get('test.plugin').manifest.dependencies).toEqual([
      { id: 'dep', version: '^1.0.0' },
    ]);
    expect(() => registry.install(manifest())).toThrow('Plugin already installed: test.plugin');
  });
  it('updates lifecycle status and health without losing manifest data', () => {
    const registry = new PluginRegistry();
    registry.install(manifest('p', { checksum: 'abc' }));
    registry.setStatus('p', 'active');
    registry.setHealth('p', { status: 'degraded', message: 'slow' });
    expect(registry.get('p')).toMatchObject({
      status: 'active',
      checksum: 'abc',
      health: { status: 'degraded', message: 'slow' },
    });
  });
  it('throws for unknown plugins instead of silently fabricating state', () =>
    expect(() => new PluginRegistry().get('missing')).toThrow('Plugin not registered: missing'));
});
