import type { Observation, ObservationBatch, ObservationProviderResult, RuntimeContext } from '../domain/types.js';
import type { ObservationProvider } from '../ports/ports.js';
export declare class ObservationAggregator {
    private readonly providers;
    constructor(providers: readonly ObservationProvider[]);
    collect(context: RuntimeContext): Promise<ObservationBatch>;
}
export declare class StaticObservationProvider implements ObservationProvider {
    readonly id: string;
    private readonly observations;
    constructor(id: string, observations: readonly Observation[]);
    collect(): Promise<ObservationProviderResult>;
}
//# sourceMappingURL=observations.d.ts.map