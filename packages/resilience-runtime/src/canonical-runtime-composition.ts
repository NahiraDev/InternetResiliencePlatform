import type { RuntimeContext } from './domain/types.js';
import type { ObservationProvider } from './ports/ports.js';
import { ResilienceRuntime, type ResilienceRuntimeOptions } from './runtime.js';

/**
 * The only supported runtime assembly boundary for process hosts.
 *
 * Hosts supply domain adapters and read-only observation providers here; they
 * never assemble a parallel planner, policy, safety, transaction, or executor
 * stack. Simulation and real execution therefore share the same
 * ResilienceRuntime and differ only in the execution context supplied here.
 */
export type CanonicalExecutionMode = 'simulation' | 'real';

export interface CanonicalRuntimeCompositionOptions extends ResilienceRuntimeOptions {
  readonly executionMode: CanonicalExecutionMode;
  readonly observationProviders?: readonly ObservationProvider[];
}

export type CanonicalRuntimeCycleInput = Omit<
  Partial<RuntimeContext> & { idempotencyKey?: string },
  'mode'
>;

export interface CanonicalRuntimeComposition {
  readonly executionMode: CanonicalExecutionMode;
  readonly runtime: ResilienceRuntime;
  runCycle(input?: CanonicalRuntimeCycleInput): ReturnType<ResilienceRuntime['runCycle']>;
}

const runtimeModeFor = (executionMode: CanonicalExecutionMode) =>
  executionMode === 'real' ? ('live' as const) : ('simulation' as const);

/**
 * Composes the canonical ResilienceRuntime for a daemon or platform client.
 * Real mode intentionally does not bypass runtime governance: it enters the
 * same policy, authorization, safety, transaction, verification and recovery
 * path as every other canonical cycle.
 */
export const createCanonicalRuntime = (
  options: CanonicalRuntimeCompositionOptions,
): CanonicalRuntimeComposition => {
  const { executionMode, observationProviders = [], ...runtimeOptions } = options;
  const runtime = new ResilienceRuntime(observationProviders, runtimeOptions);

  return Object.freeze({
    executionMode,
    runtime,
    runCycle: (input: CanonicalRuntimeCycleInput = {}) =>
      runtime.runCycle({ ...input, mode: runtimeModeFor(executionMode) }),
  });
};
