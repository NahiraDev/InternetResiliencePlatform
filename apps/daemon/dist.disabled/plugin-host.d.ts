import type { InternetResiliencePlugin } from '@irp/plugin-sdk';
export declare class PluginHost {
    private readonly manager;
    private readonly plugins;
    private running;
    constructor(plugins?: readonly InternetResiliencePlugin[]);
    start(): Promise<void>;
    stop(): Promise<void>;
    get isRunning(): boolean;
    status(): {
        loaded: string[];
        active: string[];
    };
}
//# sourceMappingURL=plugin-host.d.ts.map