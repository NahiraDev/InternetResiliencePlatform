import type { Incident, ObservationBatch, RuntimeContext } from '../domain/types.js';
export declare class IncidentCorrelator {
    correlate(batch: ObservationBatch, context: RuntimeContext): Promise<readonly Incident[]>;
}
//# sourceMappingURL=incidents.d.ts.map