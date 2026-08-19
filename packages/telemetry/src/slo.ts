export type SloStatus = 'met' | 'breached';

export interface SloWindow {
  totalRequests: number;
  successfulRequests: number;
  totalLatencyMs: number;
  latencySamples: number;
  windowSeconds: number;
}

export interface SloTarget {
  availability: number;
  maxAverageLatencyMs: number;
}

export interface SloEvaluation {
  status: SloStatus;
  availability: number;
  averageLatencyMs: number;
  errorBudget: number;
  errorBudgetRemaining: number;
  availabilityMet: boolean;
  latencyMet: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const evaluateSlo = (window: SloWindow, target: SloTarget): SloEvaluation => {
  if (!Number.isFinite(window.totalRequests) || window.totalRequests < 0) {
    throw new Error('totalRequests must be a non-negative finite number');
  }
  if (!Number.isFinite(window.successfulRequests) || window.successfulRequests < 0) {
    throw new Error('successfulRequests must be a non-negative finite number');
  }
  if (window.successfulRequests > window.totalRequests) {
    throw new Error('successfulRequests cannot exceed totalRequests');
  }
  if (!Number.isFinite(window.totalLatencyMs) || window.totalLatencyMs < 0) {
    throw new Error('totalLatencyMs must be a non-negative finite number');
  }
  if (!Number.isInteger(window.latencySamples) || window.latencySamples < 0) {
    throw new Error('latencySamples must be a non-negative integer');
  }
  if (!Number.isFinite(window.windowSeconds) || window.windowSeconds <= 0) {
    throw new Error('windowSeconds must be greater than zero');
  }
  if (!Number.isFinite(target.availability) || target.availability < 0 || target.availability > 1) {
    throw new Error('availability target must be between 0 and 1');
  }
  if (!Number.isFinite(target.maxAverageLatencyMs) || target.maxAverageLatencyMs < 0) {
    throw new Error('maxAverageLatencyMs must be non-negative');
  }

  const availability = window.totalRequests === 0
    ? 1
    : window.successfulRequests / window.totalRequests;
  const averageLatencyMs = window.latencySamples === 0
    ? 0
    : window.totalLatencyMs / window.latencySamples;
  const errorBudget = 1 - target.availability;
  const errorRate = 1 - availability;
  const errorBudgetRemaining = clamp(errorBudget - errorRate, -1, errorBudget);
  const availabilityMet = availability >= target.availability;
  const latencyMet = averageLatencyMs <= target.maxAverageLatencyMs;

  return {
    status: availabilityMet && latencyMet ? 'met' : 'breached',
    availability,
    averageLatencyMs,
    errorBudget,
    errorBudgetRemaining,
    availabilityMet,
    latencyMet,
  };
};
