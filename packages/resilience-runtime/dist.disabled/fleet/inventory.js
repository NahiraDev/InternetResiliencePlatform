/**
 * Phase 114 — Fleet Management Foundation.
 *
 * Tenant-scoped inventory of managed devices with labels, platform and agent
 * version attributes, heartbeat tracking and selector queries. The inventory
 * records what is known; it confers no authority. Trust comes from the device
 * identity ledger and authorization from capability grants.
 */
export class FleetInventoryError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'FleetInventoryError';
    }
}
/** Compares dotted numeric versions; non-numeric segments compare as 0. Returns -1, 0 or 1. */
export const compareVersions = (a, b) => {
    const pa = a.split('.').map((s) => Number.parseInt(s, 10) || 0);
    const pb = b.split('.').map((s) => Number.parseInt(s, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0)
            return d < 0 ? -1 : 1;
    }
    return 0;
};
export const deviceMatches = (d, s) => {
    if (s.tenantId !== undefined && d.tenantId !== s.tenantId)
        return false;
    if (s.platforms && !s.platforms.includes(d.platform))
        return false;
    if (s.regions && (!d.region || !s.regions.includes(d.region)))
        return false;
    if (s.deviceIds && !s.deviceIds.includes(d.deviceId))
        return false;
    if (s.minAgentVersion && compareVersions(d.agentVersion, s.minAgentVersion) < 0)
        return false;
    if (s.maxAgentVersion && compareVersions(d.agentVersion, s.maxAgentVersion) > 0)
        return false;
    if (s.labels)
        for (const [k, v] of Object.entries(s.labels))
            if (d.labels[k] !== v)
                return false;
    return true;
};
export class FleetInventory {
    devices = new Map();
    register(device) {
        if (!device.deviceId.trim() || !device.tenantId.trim())
            throw new FleetInventoryError('device-and-tenant-required');
        const existing = this.devices.get(device.deviceId);
        if (existing && existing.tenantId !== device.tenantId)
            throw new FleetInventoryError('device-id-owned-by-another-tenant');
        const frozen = Object.freeze({ ...device, labels: Object.freeze({ ...device.labels }) });
        this.devices.set(device.deviceId, frozen);
        return frozen;
    }
    heartbeat(deviceId, atMs, agentVersion) {
        const d = this.devices.get(deviceId);
        if (!d)
            throw new FleetInventoryError('unknown-device');
        const next = Object.freeze({ ...d, lastSeenAtMs: Math.max(d.lastSeenAtMs ?? 0, atMs), ...(agentVersion ? { agentVersion } : {}) });
        this.devices.set(deviceId, next);
        return next;
    }
    setLabels(deviceId, labels) {
        const d = this.devices.get(deviceId);
        if (!d)
            throw new FleetInventoryError('unknown-device');
        const next = Object.freeze({ ...d, labels: Object.freeze({ ...labels }) });
        this.devices.set(deviceId, next);
        return next;
    }
    remove(deviceId) { return this.devices.delete(deviceId); }
    get(deviceId) { return this.devices.get(deviceId); }
    get size() { return this.devices.size; }
    select(selector = {}) {
        return Object.freeze([...this.devices.values()].filter((d) => deviceMatches(d, selector)).sort((a, b) => a.deviceId.localeCompare(b.deviceId)));
    }
    groupBy(key, selector = {}) {
        const counts = {};
        for (const d of this.select(selector)) {
            const v = key.startsWith('label:') ? d.labels[key.slice(6)] : d[key];
            const bucket = v ?? 'unknown';
            counts[bucket] = (counts[bucket] ?? 0) + 1;
        }
        return Object.freeze(counts);
    }
    stale(nowMs, olderThanMs) {
        return Object.freeze(this.select().filter((d) => nowMs - (d.lastSeenAtMs ?? d.registeredAtMs) > olderThanMs));
    }
}
//# sourceMappingURL=inventory.js.map