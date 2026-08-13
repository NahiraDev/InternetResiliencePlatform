import type { NetworkSnapshot } from '../models/NetworkSnapshot.js';
export interface NetworkEventMap {
  'network.online': NetworkSnapshot;
  'network.offline': NetworkSnapshot;
  'latency.changed': { previous: number | null; current: number | null; snapshot: NetworkSnapshot };
  'quality.changed': { previous: number; current: number; snapshot: NetworkSnapshot };
  'packetloss.high': NetworkSnapshot;
  'ipv6.changed': { previous: boolean; current: boolean; snapshot: NetworkSnapshot };
  'publicip.changed': {
    previous: string | null;
    current: string | null;
    snapshot: NetworkSnapshot;
  };
  'bandwidth.changed': {
    previous: number | null;
    current: number | null;
    snapshot: NetworkSnapshot;
  };
  'gateway.changed': { previous: boolean; current: boolean; snapshot: NetworkSnapshot };
}
export type NetworkEventName = keyof NetworkEventMap;
export type NetworkEventHandler<K extends NetworkEventName> = (
  payload: NetworkEventMap[K],
) => void | Promise<void>;
export class NetworkEventEmitter {
  private readonly handlers = new Map<
    NetworkEventName,
    Set<(payload: NetworkEventMap[NetworkEventName]) => void | Promise<void>>
  >();
  subscribe<K extends NetworkEventName>(event: K, handler: NetworkEventHandler<K>): void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as (payload: NetworkEventMap[NetworkEventName]) => void | Promise<void>);
    this.handlers.set(event, set);
  }
  unsubscribe<K extends NetworkEventName>(event: K, handler: NetworkEventHandler<K>): void {
    this.handlers
      .get(event)
      ?.delete(handler as (payload: NetworkEventMap[NetworkEventName]) => void | Promise<void>);
  }
  async emit<K extends NetworkEventName>(event: K, payload: NetworkEventMap[K]): Promise<void> {
    await Promise.all([...(this.handlers.get(event) ?? [])].map((h) => h(payload)));
  }
}
