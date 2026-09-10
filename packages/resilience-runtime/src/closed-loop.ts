import type { DecisionOutcome, DecisionRecord, RuntimeContext } from './domain/types.js';
import type { ResilienceRuntime } from './runtime.js';

export type ClosedLoopStopReason =
  | 'healthy'
  | 'max_cycles'
  | 'blocked'
  | 'failed'
  | 'aborted';

export interface ClosedLoopOptions {
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
}

export interface ClosedLoopResult {
  readonly status: 'healthy' | 'bounded' | 'blocked' | 'failed' | 'aborted';
  readonly stopReason: ClosedLoopStopReason;
  readonly cyclesCompleted: number;
  readonly records: readonly DecisionRecord[];
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

/**
 * Runs the existing ResilienceRuntime in a bounded observe→decide→apply→verify/recover loop.
 * This class owns only loop control and stop conditions; decision, policy, execution,
 * verification and recovery remain owned by ResilienceRuntime and its canonical components.
 */
export class BoundedClosedLoopController {
  constructor(private readonly runtime: ClosedLoopRuntime | Pick<ResilienceRuntime, 'cycle'>) {}

  async run(options: ClosedLoopOptions = {}): Promise<ClosedLoopResult> {
    const maxCycles = options.maxCycles ?? DEFAULT_MAX_CYCLES;
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const stopWhenHealthy = options.stopWhenHealthy ?? true;
    const signal = options.signal;

    assertIntegerInRange(maxCycles, 'maxCycles', 1, MAX_ALLOWED_CYCLES);
    assertNonNegativeInteger(intervalMs, 'intervalMs');

    const records: DecisionRecord[] = [];
    const baseCorrelationId = options.correlationId ?? options.context?.correlationId ?? 'closed-loop';
    const baseIdempotencyKey = options.idempotencyKey ?? baseCorrelationId;

    for (let cycleNumber = 1; cycleNumber <= maxCycles; cycleNumber += 1) {
      if (signal?.aborted) {
        return {
          status: 'aborted',
          stopReason: 'aborted',
          cyclesCompleted: records.length,
          records,
        };
      }

      await sleep(cycleNumber === 1 ? 0 : intervalMs, signal);
      if (signal?.aborted) {
        return {
          status: 'aborted',
          stopReason: 'aborted',
          cyclesCompleted: records.length,
          records,
        };
      }

      let record: DecisionRecord;
      try {
        record = await this.runtime.cycle({
          ...(options.context ?? {}),
          correlationId: `${baseCorrelationId}/cycle-${cycleNumber}`,
          idempotencyKey: `${baseIdempotencyKey}/cycle-${cycleNumber}`,
        });
      } catch (error) {
        if (signal?.aborted) {
          return {
            status: 'aborted',
            stopReason: 'aborted',
            cyclesCompleted: records.length,
            records,
          };
        }
        throw error;
      }

      records.push(record);

      if (stopWhenHealthy && terminalHealthyOutcomes.has(record.outcome)) {
        return {
          status: 'healthy',
          stopReason: 'healthy',
          cyclesCompleted: records.length,
          records,
        };
      }

      if (record.outcome === 'blocked') {
        return {
          status: 'blocked',
          stopReason: 'blocked',
          cyclesCompleted: records.length,
          records,
        };
      }

      if (record.outcome === 'failed') {
        return {
          status: 'failed',
          stopReason: 'failed',
          cyclesCompleted: records.length,
          records,
        };
      }
    }

    return {
      status: 'bounded',
      stopReason: 'max_cycles',
      cyclesCompleted: records.length,
      records,
    };
  }
}
