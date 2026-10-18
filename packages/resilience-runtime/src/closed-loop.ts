import type { DecisionOutcome, DecisionRecord, RuntimeContext } from './domain/types.js';
import type { ResilienceRuntime } from './runtime.js';
import { detectIntentDrift, type IntentDriftResult } from './intent/drift.js';
import type { CompiledIntent } from './domain/types.js';

export type ClosedLoopStopReason = 'healthy' | 'max_cycles' | 'blocked' | 'failed' | 'aborted';

export interface ClosedLoopOptions extends Partial<RuntimeContext> {
  /** Maximum number of runtime cycles to execute. Defaults to one for safe-by-default behavior. */
  readonly maxCycles?: number;
  /** Delay between cycles in milliseconds. Defaults to zero. */
  readonly intervalMs?: number;
  /** Stop after a healthy terminal outcome. Defaults to true. */
  readonly stopWhenHealthy?: boolean;
  /** Abort signal for cooperative cancellation between cycles. */
  readonly signal?: AbortSignal;
  /** Runtime context overrides applied to every cycle. */
  readonly context?: Partial<RuntimeContext>;
  /** Base idempotency key. Each cycle receives a deterministic suffix. */
  readonly idempotencyKey?: string;
  /** Base correlation id. Each cycle receives a deterministic suffix. */
  readonly correlationId?: string;
  /** Optional observe-only inputs for Phase 85 intent drift assessment. Never triggers mutation. */
  readonly driftInputs?: {
    readonly intent: CompiledIntent;
    readonly observed: Readonly<Record<string, unknown>>;
    readonly at?: Date;
  };
}

export interface ClosedLoopResult {
  readonly status: 'healthy' | 'bounded' | 'blocked' | 'failed' | 'aborted';
  readonly stopReason: ClosedLoopStopReason;
  readonly cyclesCompleted: number;
  readonly records: readonly DecisionRecord[];
  /** Observe-only drift assessments collected when driftInputs were supplied. */
  readonly driftAssessments?: readonly IntentDriftResult[];
}

export interface ClosedLoopRuntime {
  cycle(input: Partial<RuntimeContext> & { idempotencyKey?: string }): Promise<DecisionRecord>;
}

const DEFAULT_MAX_CYCLES = 1;
const MAX_ALLOWED_CYCLES = 10;
const DEFAULT_INTERVAL_MS = 0;

const terminalHealthyOutcomes = new Set<DecisionOutcome>([
  'success',
  'recovered',
  'noop',
  'simulated',
]);

const assertIntegerInRange = (value: number, name: string, min: number, max: number): void => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
};

const assertNonNegativeInteger = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
};

const sleep = async (milliseconds: number, signal?: AbortSignal): Promise<void> => {
  if (milliseconds === 0) return;
  if (signal?.aborted) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
};

const collectOneDriftAssessment = (options: ClosedLoopOptions): IntentDriftResult | undefined => {
  if (!options.driftInputs) return undefined;
  const { intent, observed, at } = options.driftInputs;
  // Pure observation only — never mutates and never calls privileged paths.
  return detectIntentDrift(intent, observed, at);
};

/**
 * Runs the existing ResilienceRuntime in a bounded observe→decide→apply→verify/recover loop.
 * This class owns only loop control and stop conditions; decision, policy, execution,
 * verification and recovery remain owned by ResilienceRuntime and its canonical components.
 * Optional drift assessments are observe-only and must be re-admitted through governance
 * before any corrective action.
 */
export class BoundedClosedLoopController {
  constructor(private readonly runtime: ClosedLoopRuntime | Pick<ResilienceRuntime, 'cycle'>) {}

  async run(options: ClosedLoopOptions = {}): Promise<ClosedLoopResult> {
    const maxCycles = options.maxCycles ?? DEFAULT_MAX_CYCLES;
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const stopWhenHealthy = options.stopWhenHealthy ?? true;
    const signal = options.signal;
    const driftAssessments: IntentDriftResult[] = [];

    assertIntegerInRange(maxCycles, 'maxCycles', 1, MAX_ALLOWED_CYCLES);
    assertNonNegativeInteger(intervalMs, 'intervalMs');

    const records: DecisionRecord[] = [];
    const baseCorrelationId =
      options.correlationId ?? options.context?.correlationId ?? 'closed-loop';
    const baseIdempotencyKey = options.idempotencyKey ?? baseCorrelationId;
    const runtimeContextOverrides: Partial<RuntimeContext> = {
      ...(options.context ?? {}),
    };
    for (const key of [
      'runtimeId',
      'mode',
      'deadline',
      'cancelled',
      'securityContext',
      'policySnapshot',
      'capabilitySnapshot',
      'observationSnapshot',
      'configuration',
      'correlationId',
    ] as const) {
      const value = options[key];
      if (value !== undefined) {
        (runtimeContextOverrides as Record<string, unknown>)[key] = value;
      }
    }

    const withDrift = (result: Omit<ClosedLoopResult, 'driftAssessments'>): ClosedLoopResult =>
      driftAssessments.length > 0 ? { ...result, driftAssessments } : result;

    for (let cycleNumber = 1; cycleNumber <= maxCycles; cycleNumber += 1) {
      if (signal?.aborted) {
        return withDrift({
          status: 'aborted',
          stopReason: 'aborted',
          cyclesCompleted: records.length,
          records,
        });
      }

      await sleep(cycleNumber === 1 ? 0 : intervalMs, signal);
      if (signal?.aborted) {
        return withDrift({
          status: 'aborted',
          stopReason: 'aborted',
          cyclesCompleted: records.length,
          records,
        });
      }

      // Per-cycle observe-only drift assessment. Never invokes mutation.
      const assessment = collectOneDriftAssessment(options);
      if (assessment) {
        driftAssessments.push(assessment);
      }

      let record: DecisionRecord;
      try {
        record = await this.runtime.cycle({
          ...runtimeContextOverrides,
          correlationId: `${baseCorrelationId}/cycle-${cycleNumber}`,
          idempotencyKey: `${baseIdempotencyKey}/cycle-${cycleNumber}`,
        });
      } catch (error) {
        if (signal?.aborted) {
          return withDrift({
            status: 'aborted',
            stopReason: 'aborted',
            cyclesCompleted: records.length,
            records,
          });
        }
        throw error;
      }

      records.push(record);

      if (stopWhenHealthy && terminalHealthyOutcomes.has(record.outcome)) {
        return withDrift({
          status: 'healthy',
          stopReason: 'healthy',
          cyclesCompleted: records.length,
          records,
        });
      }

      if (record.outcome === 'blocked') {
        return withDrift({
          status: 'blocked',
          stopReason: 'blocked',
          cyclesCompleted: records.length,
          records,
        });
      }

      if (record.outcome === 'failed') {
        return withDrift({
          status: 'failed',
          stopReason: 'failed',
          cyclesCompleted: records.length,
          records,
        });
      }
    }

    return withDrift({
      status: 'bounded',
      stopReason: 'max_cycles',
      cyclesCompleted: records.length,
      records,
    });
  }
}
