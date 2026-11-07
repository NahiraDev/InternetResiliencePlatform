export type DiagnosticState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export interface DiagnosticCheck {
    name: string;
    state: DiagnosticState;
    latencyMs?: number;
    httpStatus?: number;
    details?: Record<string, unknown>;
}
export interface OperationalDiagnosticInput {
    target: string;
    checks: DiagnosticCheck[];
    platformStatus?: Record<string, unknown>;
    metricsAvailable?: boolean;
}
export interface OperationalDiagnosticReport {
    schemaVersion: 1;
    generatedAt: string;
    target: string;
    overall: DiagnosticState;
    checks: DiagnosticCheck[];
    dependencies: Record<string, unknown>;
    decision: Record<string, unknown>;
    observability: {
        metrics: 'available' | 'unavailable' | 'unknown';
        telemetry?: unknown;
    };
    recommendations: string[];
}
export declare const classifyDiagnosticFailure: (status: number | undefined, error?: unknown) => DiagnosticState;
export declare const buildOperationalDiagnosticReport: (input: OperationalDiagnosticInput, generatedAt?: string) => OperationalDiagnosticReport;
//# sourceMappingURL=diagnostics.d.ts.map