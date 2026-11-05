import type { PluginEventApi, TypedEvent } from '@irp/plugin-sdk';
export declare class PluginEventBus implements PluginEventApi {
    private readonly handlers;
    publish<T>(type: string, payload: T, priority?: number): Promise<void>;
    subscribe<T>(type: string, handler: (event: TypedEvent<T>) => Promise<void> | void): () => void;
    request<TReq, TRes>(type: string, payload: TReq, timeoutMs?: number): Promise<TRes>;
    broadcast<T>(type: string, payload: T): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map