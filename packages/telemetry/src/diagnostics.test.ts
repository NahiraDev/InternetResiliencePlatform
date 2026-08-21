import { describe, expect, it } from 'vitest';
import { buildOperationalDiagnosticReport, classifyDiagnosticFailure } from './diagnostics.js';

describe('operational diagnostics', () => {
  it('classifies HTTP and transport failures deterministically', () => {
    expect(classifyDiagnosticFailure(200)).toBe('healthy');
    expect(classifyDiagnosticFailure(404)).toBe('degraded');
    expect(classifyDiagnosticFailure(503)).toBe('unhealthy');
    expect(classifyDiagnosticFailure(undefined, new Error('timeout'))).toBe('unhealthy');
    expect(classifyDiagnosticFailure(undefined)).toBe('unknown');
  });

  it('builds a machine-readable report and preserves decision/dependency evidence', () => {
    const report = buildOperationalDiagnosticReport(
      {
        target: 'http://127.0.0.1:8080',
        checks: [
          { name: 'live', state: 'healthy', latencyMs: 2, httpStatus: 200 },
          { name: 'readiness', state: 'degraded', httpStatus: 503 },
          { name: 'network', state: 'healthy', httpStatus: 200 },
          { name: 'platform', state: 'healthy', httpStatus: 200 },
          { name: 'metrics', state: 'healthy', httpStatus: 200 },
        ],
        platformStatus: {
          dependencies: { database: 'degraded' },
          decision: { recommendation: 'investigate-degraded-connectivity' },
          observability: { telemetry: { enabled: true } },
        },
        metricsAvailable: true,
      },
      '2026-01-01T00:00:00.000Z',
    );

    expect(report.schemaVersion).toBe(1);
    expect(report.overall).toBe('degraded');
    expect(report.dependencies).toEqual({ database: 'degraded' });
    expect(report.decision).toEqual({ recommendation: 'investigate-degraded-connectivity' });
    expect(report.observability.metrics).toBe('available');
    expect(report.recommendations).toContain(
      'Inspect dependency readiness and startup/runtime logs before changing network policy.',
    );
  });
});
