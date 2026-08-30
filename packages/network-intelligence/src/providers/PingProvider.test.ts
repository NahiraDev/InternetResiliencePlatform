import { describe, expect, it } from 'vitest';
import { MockablePingProvider, SystemPingProvider } from './PingProvider.js';
describe('PingProvider', () => {
  it('keeps the deterministic mock fixture available', async () => {
    const result = await new MockablePingProvider().ping('fixture.local', new AbortController().signal);
    expect(result).toEqual({ latencyMs: 1, success: true });
  });
  it('rejects empty and multiline hosts before invoking the OS utility', async () => {
    const provider = new SystemPingProvider();
    await expect(provider.ping('  ', new AbortController().signal)).rejects.toThrow('host must be a non-empty single-line value');
    await expect(provider.ping('example.com\necho unsafe', new AbortController().signal)).rejects.toThrow('host must be a non-empty single-line value');
  });
  it('rejects invalid timeout configuration', () => {
    expect(() => new SystemPingProvider(100)).toThrow('timeoutMs must be an integer >= 250');
    expect(() => new SystemPingProvider(250.5)).toThrow('timeoutMs must be an integer >= 250');
  });
});
