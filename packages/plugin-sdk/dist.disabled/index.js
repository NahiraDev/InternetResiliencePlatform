export class BasePlugin {
    context;
    initialize(context) {
        this.context = context;
    }
    health() {
        return { status: 'healthy', message: `${this.manifest.id} ready` };
    }
    log(message, meta) {
        this.context?.logger.info(message, meta);
    }
}
export const definePlugin = (plugin) => plugin;
//# sourceMappingURL=index.js.map