import type { PluginEventApi, TypedEvent } from '@irp/plugin-sdk';
export class PluginEventBus implements PluginEventApi {
  private readonly handlers = new Map<string, Set<(event: TypedEvent) => Promise<void> | void>>();
  async publish<T>(type: string, payload: T, priority = 0): Promise<void> {
    const event: TypedEvent<T> = {
      type,
      payload,
      priority,
      timestamp: new Date().toISOString(),
      source: 'plugin-runtime',
    };
    const handlers = [...(this.handlers.get(type) ?? []), ...(this.handlers.get('*') ?? [])].sort(
      () => -priority,
    );
    await Promise.all(handlers.map((h) => h(event)));
  }
  subscribe<T>(type: string, handler: (event: TypedEvent<T>) => Promise<void> | void): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler as (event: TypedEvent) => Promise<void> | void);
    this.handlers.set(type, set);
    return () => set.delete(handler as (event: TypedEvent) => Promise<void> | void);
  }
  async request<TReq, TRes>(type: string, payload: TReq, timeoutMs = 5000): Promise<TRes> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    try {
      const response = new Promise<TRes>((resolve, reject) => {
        unsubscribe = this.subscribe<TRes>(`${type}:response`, (event) => resolve(event.payload));
        timer = setTimeout(
          () => reject(new Error(`Plugin request ${type} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });
      await this.publish(`${type}:request`, payload);
      return await response;
    } finally {
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    }
  }
  async broadcast<T>(type: string, payload: T): Promise<void> {
    await this.publish(type, payload, 100);
  }
}
