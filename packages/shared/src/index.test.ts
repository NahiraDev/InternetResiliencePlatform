import { describe, expect, it } from 'vitest';
import { IdentifierSchema, createId } from './index.js';

describe('shared contracts', () => {
  it('validates identifiers with minimum and maximum boundaries', () => {
    expect(IdentifierSchema.parse('provider-1')).toBe('provider-1');
    expect(() => IdentifierSchema.parse('')).toThrow();
    expect(() => IdentifierSchema.parse('x'.repeat(129))).toThrow();
  });

  it('creates prefixed unique ids and narrows defined values', () => {
    const id = createId('dns');
    expect(id).toMatch(/^dns_[0-9a-f-]{36}$/);
  });
});
