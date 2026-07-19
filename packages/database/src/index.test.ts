import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('phase 6 network database schema', () => {
  it('declares network intelligence models', () => {
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    expect(schema).toContain('model NetworkMeasurement');
    expect(schema).toContain('model NetworkNode');
    expect(schema).toContain('model NetworkHealthScore');
  });
});
