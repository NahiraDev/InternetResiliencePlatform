import { describe, expectTypeOf, it } from 'vitest';
import type { Environment, HealthState, VersionInfo } from './index.js';
describe('shared type contracts', () => {
  it('keeps environment, health, and version contracts compile-time compatible', () => {
    expectTypeOf<'production'>().toExtend<Environment>();
    expectTypeOf<'healthy'>().toExtend<HealthState>();
    expectTypeOf<VersionInfo>().toEqualTypeOf<{ name: string; version: string; node: string }>();
  });
});
