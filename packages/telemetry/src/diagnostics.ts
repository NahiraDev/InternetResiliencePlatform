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

const severity: Record<DiagnosticState, number> = {
  healthy: 0,
  degraded: 1,
  unknown: 2,
  unhealthy: 3,
};

export const classifyDiagnosticFailure = (status: number | undefined, error?: unknown): DiagnosticState => {
  if (status === undefined) return error ? 'unhealthy' : 'unknown';
  if (status >= 200 && status < 300) return 'healthy';
  if (status === 429 || (status >= 500 && status < 600)) return 'unhealthy';
  if (status >= 400) return 'degraded';
  return 'unknown';
};

const recommendationFor = (check: DiagnosticCheck): string | undefined => {
  if (check.state === 'healthy') return undefined;
  if (check.name === 'readiness') return 'Inspect dependency readiness and startup/runtime logs before changing network policy.';
  if (check.name === 'network') return 'Inspect DNS, transport, route/provider health and application-level reachability before switching paths.';
  if (check.name === 'platform') return 'Inspect the current route decision, recovery issues and dependency state; do not blindly retry or flap routes.';
  if (check.name === 'metrics') return 'Restore the local metrics exposition path; diagnostics remain usable without external telemetry collectors.';
  return `Investigate the ${check.name} diagnostic check and its structured details.`;
};

export const buildOperationalDiagnosticReport = (
  input: OperationalDiagnosticInput,
  generatedAt = new Date().toISOString(),
): OperationalDiagnosticReport => {
  const checks = input.checks.map((check) => ({ ...check, details: check.details ? { ...check.details } : undefined }));
  const worst = checks.reduce<DiagnosticState>((current, check) =>
    severity[check.state] > severity[current] ? check.state : current,
  'healthy');
  const platform = input.platformStatus ?? {};
  const dependencies = (platform.dependencies as Record<string, unknown> | undefined) ?? {};
  const decision = (platform.decision as Record<string, unknown> | undefined) ?? {};
  const observability = (platform.observability as Record<string, unknown> | undefined) ?? {};
  const recommendations = checks.map(recommendationFor).filter((value): value is string => Boolean(value));
  return {
    schemaVersion: 1,
    generatedAt,
    target: input.target,
    overall: worst,
    checks,
    dependencies,
    decision,
    observability: {
      metrics: input.metricsAvailable === true ? 'available' : input.metricsAvailable === false ? 'unavailable' : 'unknown',
      ...(observability.telemetry !== undefined ? { telemetry: observability.telemetry } : {}),
    },
    recommendations: [...new Set(recommendations)],
  };
};
