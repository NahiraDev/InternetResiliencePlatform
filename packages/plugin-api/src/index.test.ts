import { describe, expect, it } from 'vitest';
import { createPluginApi, SecureCapabilityApi } from './index.js';
import type { PluginEventApi, PluginManifest } from '@irp/plugin-sdk';

const manifest = (permissions: PluginManifest['permissions'] = []): PluginManifest => ({
  id: 'test.plugin',
  name: 'test-plugin',
  displayName: 'Test Plugin',
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
  capabilities: ['network-analyzer'],
});
const events: PluginEventApi = {
  publish: async () => {},
  subscribe: () => () => {},
  request: async () => undefined as never,
  broadcast: async () => {},
};

describe('plugin api permission boundaries', () => {
  it('rejects capability calls without the required permission', async () => {
    const api = createPluginApi(manifest(), events);
    await expect(api.network.call('status')).rejects.toThrow('Permission denied: network.read');
  });
  it('dispatches registered operations when permission is present', async () => {
    const cap = new SecureCapabilityApi('network', manifest(['network.read']), 'network.read');
    cap.register('status', (input) => ({ ok: true, input }));
    await expect(cap.call('status', { probe: 'loopback' })).resolves.toEqual({
      ok: true,
      input: { probe: 'loopback' },
    });
  });
  it('reports unsupported operations distinctly from denied permissions', async () => {
    await expect(
      new SecureCapabilityApi('dns', manifest(['dns.modify']), 'dns.modify').call('flush'),
    ).rejects.toThrow('Unsupported dns operation: flush');
  });
});
