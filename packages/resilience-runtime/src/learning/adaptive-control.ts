/**
 * Failure classification and adaptive control intensity for issue #279
 * (issue #272 Section H, tasks 3 and 4).
 *
 * Task 4: classify a failure by the layer that actually failed and by failure
 * domain, so the runtime can distinguish "this path broke" from "this whole
 * provider is down". Retrying blindly wastes mutation budget and can deepen the
 * incident.
 *
 * Task 3: control intensity adapts to observed outcomes. After repeated
 * failures the runtime must reduce how aggressively it acts, and it must relax
 * again only with evidence.
 */

import { deepFreeze } from '../domain/ids.js';
import type { HealthReport, ScopedHealthSignal, HealthScope } from '../verification/outcome-verification.js';

export const FAILURE_LAYERS = [
  'application',
  'service',
  'destination',
  'transport',
  'path',
  'resource',
  'provider',
  'region',
  'unknown',
] as const;

export type FailureLayer = (typeof FAILURE_LAYERS)[number];

export interface FailureClassification {
  readonly failedLayer: FailureLayer;
  /** Scope at which health is worst; the narrowest true description. */
  readonly widestAffectedScope: HealthScope | 'none';
  readonly failureDomain?: string;
  /** Scopes confirmed healthy, which bounds what the failure can be. */
  readonly healthyScopes: readonly HealthScope[];
  /** True when several scopes in one domain failed together. */
  readonly correlated: boolean;
  /** Suggested next layer to try, if any. */
  readonly alternativeHint?: FailureLayer;
  readonly rationale: string;
}

const LAYER_FOR_SCOPE: Readonly<Record<HealthScope, FailureLayer>> = Object.freeze({
  application: 'application',
  service: 'service',
  destination: 'destination',
  transport: 'transport',
  path: 'path',
  resource: 'resource',
  region: 'region',
  provider: 'provider',
  workload: 'application',
});

/** Widest-to-narrowest, used to report the outermost layer that is broken. */
const SCOPE_BREADTH: readonly HealthScope[] = [
  'provider',
  'region',
  'resource',
  'transport',
  'path',
  'destination',
  'service',
  'workload',
  'application',
];

/**
 * Classifies a failure from scoped health. The outermost failing scope bounds
 * the incident: if `transport` is failed then `destination` being failed is a
 * consequence, not an independent fault, and a strategy targeting the
 * destination alone would be a blind retry.
 */
export const classifyFailureLayer = (
  health: HealthReport,
  options: { readonly failureDomain?: string; readonly signals?: readonly ScopedHealthSignal[] } = {},
): FailureClassification => {
  const failing = SCOPE_BREADTH.filter(
    (scope) => health.byScope[scope] === 'failed' || health.byScope[scope] === 'degraded',
  );
  const healthyScopes = SCOPE_BREADTH.filter((scope) => health.byScope[scope] === 'healthy');

  if (failing.length === 0) {
    return deepFreeze({
      failedLayer: 'unknown' as FailureLayer,
      widestAffectedScope: 'none',
      healthyScopes: Object.freeze(healthyScopes),
      correlated: false,
      rationale: 'no failing scope: nothing to classify',
    });
  }

  // Outermost failing scope wins: SCOPE_BREADTH runs broadest-first, so the
  // first failing entry is the broadest true statement. A failed transport
  // bounds a failed destination as a consequence, not an independent fault.
  const widestAffectedScope = failing[0]!;
  const failedLayer = LAYER_FOR_SCOPE[widestAffectedScope];

  // Correlated: an outer layer and everything beneath it all failed together.
  const correlated =
    failing.length >= 2 && failing.some((scope) => SCOPE_BREADTH.indexOf(scope) > SCOPE_BREADTH.indexOf(widestAffectedScope));

  const domains = new Set(
    (options.signals ?? health.signals)
      .filter((signal) => signal.failureDomain !== undefined)
      .map((signal) => signal.failureDomain as string),
  );

  let alternativeHint: FailureLayer | undefined;
  if (widestAffectedScope === 'transport') alternativeHint = 'path';
  else if (widestAffectedScope === 'path') alternativeHint = 'resource';
  else if (widestAffectedScope === 'resource') alternativeHint = 'provider';
  else if (widestAffectedScope === 'provider') alternativeHint = 'region';

  return deepFreeze({
    failedLayer,
    widestAffectedScope,
    ...(options.failureDomain !== undefined ? { failureDomain: options.failureDomain } : {}),
    healthyScopes: Object.freeze(healthyScopes),
    correlated,
    ...(alternativeHint !== undefined ? { alternativeHint } : {}),
    rationale: `outermost failing scope '${widestAffectedScope}' bounds the incident; ` +
      `${failing.length} scope(s) failing across ${domains.size || 1} failure domain(s)`,
  });
};

export const CONTROL_INTENSITIES = ['observe', 'probe', 'degraded', 'autonomous'] as const;
export type ControlIntensity = (typeof CONTROL_INTENSITIES)[number];

export interface AdaptiveIntensityState {
  readonly intensity: ControlIntensity;
  /** Consecutive verified-successful outcomes. */
  readonly consecutiveSuccesses: number;
  /** Consecutive verified-failures. */
  readonly consecutiveFailures: number;
  /** Consecutive escalations toward autonomous. */
  readonly promotions: number;
  readonly rationale: string;
}

export interface AdaptiveIntensityOptions {
  /** Successes required to promote one level. */
  readonly promoteAfter?: number;
  /** Failures required to demote one level. */
  readonly demoteAfter?: number;
  /** Hard cap: learning may never reach the top intensity on its own. */
  readonly ceiling?: ControlIntensity;
  readonly start?: ControlIntensity;
}

/**
 * Adaptive control intensity.
 *
 * Demotion is faster than promotion (default 2 failures vs 3 successes) because
 * an unverified action during an incident is worse than a slow one. Promotion
 * requires verified evidence, and the ceiling means learning can never grant
 * itself the highest intensity — that requires explicit operator policy.
 */
export class AdaptiveControlIntensity {
  private level: number;
  private successes = 0;
  private failures = 0;
  private promotions = 0;
  private readonly promoteAfter: number;
  private readonly demoteAfter: number;
  private readonly ceiling: ControlIntensity;
  private readonly start: ControlIntensity;

  constructor(options: AdaptiveIntensityOptions = {}) {
    this.promoteAfter = Math.max(1, options.promoteAfter ?? 3);
    this.demoteAfter = Math.max(1, options.demoteAfter ?? 2);
    this.ceiling = options.ceiling ?? 'degraded';
    this.start = options.start ?? 'observe';
    this.level = CONTROL_INTENSITIES.indexOf(this.start);
  }

  private get ceilingIndex(): number {
    return CONTROL_INTENSITIES.indexOf(this.ceiling);
  }

  /** Records a *verified* successful outcome. Return codes are not evidence. */
  recordSuccess(): AdaptiveIntensityState {
    this.successes += 1;
    this.failures = 0;
    if (this.successes >= this.promoteAfter && this.level < this.ceilingIndex) {
      this.level += 1;
      this.promotions += 1;
      this.successes = 0;
      return this.state(`promoted to '${CONTROL_INTENSITIES[this.level]}' after ${this.promoteAfter} verified successes`);
    }
    return this.state(`${this.successes}/${this.promoteAfter} successes toward promotion`);
  }

  /** Records a verified failure or an unverified outcome. */
  recordFailure(): AdaptiveIntensityState {
    this.failures += 1;
    this.successes = 0;
    if (this.failures >= this.demoteAfter && this.level > 0) {
      this.level -= 1;
      this.failures = 0;
      return this.state(`demoted to '${CONTROL_INTENSITIES[this.level]}' after ${this.demoteAfter} failures`);
    }
    return this.state(`${this.failures}/${this.demoteAfter} failures toward demotion`);
  }

  reset(): AdaptiveIntensityState {
    this.level = CONTROL_INTENSITIES.indexOf(this.start);
    this.successes = 0;
    this.failures = 0;
    this.promotions = 0;
    return this.state('reset to starting intensity');
  }

  private state(rationale: string): AdaptiveIntensityState {
    return deepFreeze({
      intensity: CONTROL_INTENSITIES[this.level]!,
      consecutiveSuccesses: this.successes,
      consecutiveFailures: this.failures,
      promotions: this.promotions,
      rationale,
    });
  }

  snapshot(): AdaptiveIntensityState {
    return this.state('snapshot');
  }
}