import type { DecisionRecord, Incident, RuntimeHealth, RuntimeMode, RuntimeSnapshot } from './domain/types.js';
export type RuntimeApiStatus = 'ok' | 'error';
export interface RuntimeEnvelope<T> {
    schemaVersion: number;
    timestamp: string;
    correlationId?: string;
    status: RuntimeApiStatus;
    data: T;
}
export interface RuntimeErrorDto {
    code: string;
    message: string;
    correlationId?: string;
    retryable: boolean;
    details?: Record<string, string | number | boolean>;
}
export type RuntimeCycleRequestDto = {
    mode: RuntimeMode;
};
export type RuntimeStatusDto = {
    runtimeId: string;
    instanceId: string;
    health: RuntimeHealth;
    mode: RuntimeMode;
    state: RuntimeSnapshot['state'];
    uptimeMs: number;
};
export type RuntimeSnapshotDto = RuntimeSnapshot & {
    runtimeId: string;
    instanceId: string;
};
export type RuntimeDecisionDto = DecisionRecord;
export type RuntimeIncidentDto = Incident;
export declare const runtimeEnvelope: <T>(data: T, correlationId?: string) => RuntimeEnvelope<T>;
//# sourceMappingURL=contracts.d.ts.map