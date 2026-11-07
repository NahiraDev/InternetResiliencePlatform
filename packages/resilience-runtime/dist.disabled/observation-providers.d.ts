import type { Observation, ObservationProviderResult, RuntimeContext } from './domain/types.js';
import type { ObservationProvider } from './ports/ports.js';
declare class ObservationProviderRegistry {
    private readonly providers;
    register(provider: ObservationProvider): void;
    list(): ObservationProvider[];
    collect(context: RuntimeContext): Promise<ObservationProviderResult[]>;
}
export declare const observation: (source: string, category: string, metric: string, status?: Observation["status"], value?: unknown) => Observation;
export declare class TruthfulObservationProvider implements ObservationProvider {
    readonly id: string;
    private readonly category;
    private readonly status;
    constructor(id: string, category: string, status?: Observation['status']);
    collect(): Promise<ObservationProviderResult>;
}
export declare const createDefaultObservationProviderRegistry: () => ObservationProviderRegistry;
export {};
//# sourceMappingURL=observation-providers.d.ts.map