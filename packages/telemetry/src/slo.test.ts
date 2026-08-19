import { describe, expect, it } from 'vitest';
import { evaluateSlo } from './slo.js';

describe('evaluateSlo', () => {
  const target = {
    availability: 0.99,
    maxAverageLatencyMs: 250,
  };

  it('marks a healthy window as met', () => {
    expect(
      evaluateSlo(
        {
          totalRequests: 1000,
          successfulRequests: 999,
          totalLatencyMs: 180_000,
          latencySamples: 1000,
          windowSeconds: 300,
        },
        target,
      ),
    ).toMatchObject({
      status: 'met',
      availability: 0.999,
      averageLatencyMs: 180,
      availabilityMet: true,
      latencyMet: true,
    });
  });

  it('reports an availability breach and negative remaining budget', () => {
    const result = evaluateSlo(
      {
        totalRequests: 1000,
        successfulRequests: 970,
        totalLatencyMs: 100_000,
        latencySamples: 1000,
        windowSeconds: 300,
      },
      target,
    );

    expect(result.status).toBe('breached');
    expect(result.availabilityMet).toBe(false);
    expect(result.errorBudgetRemaining).toBeLessThan(0);
    expect(result.latencyMet).toBe(true);
  });

  it('reports a latency breach independently of availability', () => {
    const result = evaluateSlo(
      {
        totalRequests: 1000,
        successfulRequests: 1000,
        totalLatencyMs: 300_000,
        latencySamples: 1000,
        windowSeconds: 300,
      },
      target,
    );

    expect(result.status).toBe('breached');
    expect(result.availabilityMet).toBe(true);
    expect(result.latencyMet).toBe(false);
  });

  it('treats an empty request window as fully available', () => {
    expect(
      evaluateSlo(
        {
          totalRequests: 0,
          successfulRequests: 0,
          totalLatencyMs: 0,
          latencySamples: 0,
          windowSeconds: 300,
        },
        target,
      ).availability,
    ).toBe(1);
  });

  it('rejects invalid measurements', () => {
    expect(() =>
      evaluateSlo(
        {
          totalRequests: 10,
          successfulRequests: 11,
          totalLatencyMs: 10,
          latencySamples: 1,
          windowSeconds: 60,
        },
        target,
      ),
    ).toThrow('successfulRequests cannot exceed totalRequests');
  });
});
