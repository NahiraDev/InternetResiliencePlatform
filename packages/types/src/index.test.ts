import { describe, expectTypeOf, it } from 'vitest';
import type { Environment, HealthState, VersionInfo } from './index.js';
describe('shared type contracts', () => {
  it('keeps environment, health, and version contracts compile-time compatible', () => {
    expectTypeOf<'production'>().toExtend<Environment>();
    expectTypeOf<'healthy'>().toExtend<HealthState>();
    expectTypeOf<'degraded'>().toExtend<HealthState>();
    expectTypeOf<'unhealthy'>().toExtend<HealthState>();
    expectTypeOf<'unknown'>().toExtend<HealthState>();
    expectTypeOf<'starting'>().toExtend<HealthState>();
    expectTypeOf<'draining'>().toExtend<HealthState>();
    expectTypeOf<VersionInfo>().toEqualTypeOf<{ name: string; version: string; node: string }>();
  });
});
