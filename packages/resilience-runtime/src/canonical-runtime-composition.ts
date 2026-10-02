import type { RuntimeContext } from './domain/types.js';
import type { ObservationProvider } from './ports/ports.js';
import { ResilienceRuntime, type ResilienceRuntimeOptions } from './runtime.js';
import { ProgrammableConnectivityFabric, type FabricDiscoveryProvider, type FabricSelectionRequest, type FabricSelectionResult } from './fabric.js';

export type CanonicalExecutionMode = 'simulation' | 'real';

export interface CanonicalRuntimeCompositionOptions extends ResilienceRuntimeOptions {
  readonly executionMode: CanonicalExecutionMode;
  readonly observationProviders?: readonly ObservationProvider[];
  readonly fabric?: ProgrammableConnectivityFabric;
  readonly fabricDiscoveryProviders?: readonly FabricDiscoveryProvider[];
}

export type CanonicalRuntimeCycleInput = Omit<
  Partial<RuntimeContext> & { idempotencyKey?: string },
  'mode'
>;

export interface CanonicalRuntimeComposition {
  readonly executionMode: CanonicalExecutionMode;
  readonly runtime: ResilienceRuntime;
  readonly fabric: ProgrammableConnectivityFabric;
  discoverFabricResources(options?: { signal?: AbortSignal; limit?: number; since?: string }): ReturnType<ProgrammableConnectivityFabric['discover']>;
  selectFabricResource(request?: FabricSelectionRequest): FabricSelectionResult;
  runCycle(input?: CanonicalRuntimeCycleInput): ReturnType<ResilienceRuntime['runCycle']>;
}

const runtimeModeFor = (executionMode: CanonicalExecutionMode) =>
  executionMode === 'real' ? ('live' as const) : ('simulation' as const);

export const createCanonicalRuntime = (
  options: CanonicalRuntimeCompositionOptions,
): CanonicalRuntimeComposition => {
  const { executionMode, observationProviders = [], fabric, fabricDiscoveryProviders = [], ...runtimeOptions } = options;
  const runtime = new ResilienceRuntime(observationProviders, runtimeOptions);
  const connectivityFabric = fabric ?? new ProgrammableConnectivityFabric();
  for (const provider of fabricDiscoveryProviders) connectivityFabric.registerProvider(provider);

  return Object.freeze({
    executionMode,
    runtime,
    fabric: connectivityFabric,
    discoverFabricResources: (discoveryOptions = {}) => connectivityFabric.discover(discoveryOptions),
    selectFabricResource: (request = {}) => connectivityFabric.select(request),
    runCycle: (input: CanonicalRuntimeCycleInput = {}) =>
      runtime.runCycle({ ...input, mode: runtimeModeFor(executionMode) }),
  });
};
