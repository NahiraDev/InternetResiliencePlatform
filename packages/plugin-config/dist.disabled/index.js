import { CryptoService, KeyManager, SecureStorage } from '@irp/security';
export class PluginConfigStore {
    values = new Map();
    secure = new SecureStorage(new CryptoService(), new KeyManager());
    reloaders = new Map();
    defaults(schema) {
        const out = {};
        for (const [k, p] of Object.entries(schema?.properties ?? {}))
            if (p.default !== undefined)
                out[k] = p.default;
        return out;
    }
    validate(schema, value) {
        if (!schema)
            return;
        for (const key of schema.required ?? [])
            if (value[key] === undefined)
                throw new Error(`Missing required plugin configuration: ${key}`);
        for (const [key, prop] of Object.entries(schema.properties))
            if (value[key] !== undefined &&
                typeof value[key] !== prop.type &&
                !(prop.type === 'array' && Array.isArray(value[key])))
                throw new Error(`Invalid configuration type for ${key}`);
    }
    async set(id, schema, value) {
        const next = { ...this.defaults(schema), ...value };
        this.validate(schema, next);
        const encrypted = new Set(schema?.encrypted ?? []);
        const plain = Object.fromEntries(Object.entries(next).filter(([k]) => !encrypted.has(k)));
        const secret = Object.fromEntries(Object.entries(next).filter(([k]) => encrypted.has(k)));
        this.values.set(id, plain);
        if (Object.keys(secret).length)
            this.secure.set(id, secret);
        await Promise.all([...(this.reloaders.get(id) ?? [])].map((h) => h(this.get(id))));
    }
    get(id) {
        return { ...(this.values.get(id) ?? {}), ...(this.secure.get(id) ?? {}) };
    }
    api(id, schema) {
        return {
            get: () => this.get(id),
            update: async (patch) => {
                await this.set(id, schema, { ...this.get(id), ...patch });
                return this.get(id);
            },
            onReload: (handler) => {
                const set = this.reloaders.get(id) ?? new Set();
                set.add(handler);
                this.reloaders.set(id, set);
                return () => set.delete(handler);
            },
        };
    }
    migrate(plugin, config, from, to) {
        return plugin.migrateConfig ? plugin.migrateConfig(config, from, to) : config;
    }
}
//# sourceMappingURL=index.js.map