type LogArea = 'application' | 'IPC' | 'backend connection' | 'security' | 'UI';
const sensitive = /password|token|privateKey|credential|secret|rawDns/i;
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sensitive.test(k) ? '[REDACTED]' : sanitize(v)]),
    );
  return value;
}
export function log(area: LogArea, message: string, context: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      area,
      message,
      context: sanitize(context),
    }),
  );
}
