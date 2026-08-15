import { describe, expect, it } from 'vitest';
import { PluginConfigStore } from './index.js';
import type { ConfigurationSchema } from '@irp/plugin-sdk';
const schema: ConfigurationSchema = {
  type: 'object',
  required: ['endpoint'],
  encrypted: ['token'],
  properties: {
    endpoint: { type: 'string' },
    retries: { type: 'number', default: 3 },
    token: { type: 'string' },
  },
};
describe('PluginConfigStore', () => {
  it('applies defaults, validates required/type constraints, and returns encrypted values', async () => {
    const store = new PluginConfigStore();
    await store.set('p', schema, { endpoint: 'https://local', token: 'secret' });
    expect(store.get('p')).toEqual({ endpoint: 'https://local', retries: 3, token: 'secret' });
    await expect(store.set('bad', schema, { endpoint: 1 })).rejects.toThrow(
      'Invalid configuration type for endpoint',
    );
  });
  it('notifies reload listeners for updates and supports unsubscription', async () => {
    const store = new PluginConfigStore();
    const seen: unknown[] = [];
    const api = store.api('p', schema);
    const off = api.onReload((c) => {
      seen.push(c);
    });
    await api.update({ endpoint: 'a', token: 't' });
    off();
    await api.update({ endpoint: 'b' });
    expect(seen).toEqual([{ endpoint: 'a', retries: 3, token: 't' }]);
  });
});
