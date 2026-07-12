import { describe, expect, it } from 'vitest';
import type { DnsResolver } from './index.js';

describe('DNS interfaces', () => {
  it('supports resolver implementations', async () => {
    const resolver: DnsResolver = { resolve: async (question) => [{ ...question, ttl: 60, value: '127.0.0.1' }] };
    await expect(resolver.resolve({ name: 'example.test', recordType: 'A' })).resolves.toHaveLength(1);
  });
});
