export class PluginRegistry {
    records = new Map();
    install(manifest) {
        if (this.records.has(manifest.id))
            throw new Error(`Plugin already installed: ${manifest.id}`);
        const now = new Date().toISOString();
        const rec = {
            manifest,
            status: 'installed',
            installedAt: now,
            updatedAt: now,
            health: {
                status: 'healthy',
                memoryBytes: 0,
                cpuUserMicros: 0,
                activationTimeMs: 0,
                crashCount: 0,
                restartCount: 0,
                checkedAt: now,
            },
            ...(manifest.checksum ? { checksum: manifest.checksum } : {}),
            ...(manifest.signature ? { signature: manifest.signature } : {}),
        };
        this.records.set(manifest.id, rec);
        return rec;
    }
    update(manifest) {
        const current = this.get(manifest.id);
        const rec = {
            ...current,
            manifest,
            updatedAt: new Date().toISOString(),
            status: 'installed',
        };
        this.records.set(manifest.id, rec);
        return rec;
    }
    setStatus(id, status) {
        const rec = this.get(id);
        this.records.set(id, { ...rec, status, updatedAt: new Date().toISOString() });
    }
    setHealth(id, health) {
        const rec = this.get(id);
        this.records.set(id, {
            ...rec,
            health: { ...rec.health, ...health, checkedAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
        });
    }
    remove(id) {
        this.records.delete(id);
    }
    get(id) {
        const rec = this.records.get(id);
        if (!rec)
            throw new Error(`Plugin not registered: ${id}`);
        return rec;
    }
    find(id) {
        return this.records.get(id);
    }
    list() {
        return [...this.records.values()];
    }
}
//# sourceMappingURL=index.js.map