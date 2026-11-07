const RUNTIME_API_SCHEMA_VERSION = 1;
export const runtimeEnvelope = (data, correlationId) => ({
    schemaVersion: RUNTIME_API_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {}),
    status: 'ok',
    data,
});
//# sourceMappingURL=contracts.js.map