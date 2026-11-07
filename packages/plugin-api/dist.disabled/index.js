export class SecureCapabilityApi {
    name;
    manifest;
    required;
    operations;
    constructor(name, manifest, required, operations = new Map()) {
        this.name = name;
        this.manifest = manifest;
        this.required = required;
        this.operations = operations;
    }
    async call(operation, input) {
        if (!this.manifest.permissions.includes(this.required))
            throw new Error(`Permission denied: ${this.required}`);
        const op = this.operations.get(operation);
        if (!op)
            throw new Error(`Unsupported ${this.name} operation: ${operation}`);
        return (await op(input));
    }
    register(operation, handler) {
        this.operations.set(operation, handler);
    }
}
export const createPluginApi = (manifest, events) => ({
    network: new SecureCapabilityApi('network', manifest, 'network.read'),
    dns: new SecureCapabilityApi('dns', manifest, 'dns.modify'),
    vpn: new SecureCapabilityApi('vpn', manifest, 'vpn.connect'),
    routing: new SecureCapabilityApi('routing', manifest, 'network.write'),
    storage: new SecureCapabilityApi('storage', manifest, 'filesystem.write'),
    configuration: new SecureCapabilityApi('configuration', manifest, 'config.read'),
    logging: new SecureCapabilityApi('logging', manifest, 'telemetry.publish'),
    telemetry: new SecureCapabilityApi('telemetry', manifest, 'telemetry.publish'),
    security: new SecureCapabilityApi('security', manifest, 'config.read'),
    metrics: new SecureCapabilityApi('metrics', manifest, 'metrics.export'),
    notification: new SecureCapabilityApi('notification', manifest, 'notifications.send'),
    scheduler: new SecureCapabilityApi('scheduler', manifest, 'config.read'),
    events,
});
//# sourceMappingURL=index.js.map