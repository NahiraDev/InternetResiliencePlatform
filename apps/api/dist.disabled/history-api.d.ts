import type { FastifyInstance } from 'fastify';
import { type HistoricalMeasurementStore } from '@irp/historical-analysis';
export interface HistoryApiHandle {
    store: HistoricalMeasurementStore;
}
export declare const registerHistoryRoutes: (app: FastifyInstance, store?: HistoricalMeasurementStore) => HistoryApiHandle;
//# sourceMappingURL=history-api.d.ts.map