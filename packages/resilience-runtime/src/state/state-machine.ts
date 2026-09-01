import { nextId, nowIso } from '../domain/ids.js';
import type { RuntimeState, RuntimeTransition } from '../domain/types.js';
import type { EventSink } from '../ports/ports.js';
const active: RuntimeState[] = [
  'idle',
  'observing',
  'analyzing',
  'planning',
  'validating',
  'executing',
  'verifying',
  'recovering',
  'degraded',
  'blocked',
];
export const legalTransitions: Readonly<Record<RuntimeState, readonly RuntimeState[]>> = {
  idle: ['observing', 'stopped', 'failed'],
  observing: ['analyzing', 'stopped', 'failed'],
  analyzing: ['planning', 'stopped', 'failed'],
  planning: ['validating', 'blocked', 'stopped', 'failed'],
  validating: ['executing', 'observing', 'blocked', 'stopped', 'failed'],
  executing: ['verifying', 'recovering', 'stopped', 'failed'],
  verifying: ['observing', 'degraded', 'recovering', 'stopped', 'failed'],
  recovering: ['verifying', 'degraded', 'failed'],
  degraded: ['observing', 'stopped', 'failed'],
  blocked: ['observing', 'stopped', 'failed'],
  stopped: [],
  failed: [],
};
export class RuntimeStateMachine {
  private state: RuntimeState;
  constructor(
    initial: RuntimeState = 'idle',
    private readonly events?: EventSink,
  ) {
    this.state = initial;
  }
  current() {
    return this.state;
  }
  async transition(to: RuntimeState, correlationId = 'state'): Promise<RuntimeTransition> {
    if (!legalTransitions[this.state].includes(to))
      throw new Error(`Illegal runtime transition ${this.state} -> ${to}`);
    const from = this.state;
    const transition = {
      id: nextId('transition'),
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId,
      source: 'resilience-runtime',
      metadata: {},
      from,
      to,
    };
    this.state = to;
    await this.events?.emit('runtime.state.changed', transition);
    if (to === 'blocked') await this.events?.emit('runtime.blocked', transition);
    if (to === 'degraded') await this.events?.emit('runtime.degraded', transition);
    if (to === 'failed') await this.events?.emit('runtime.failed', transition);
    return transition;
  }
  async fail(correlationId = 'state') {
    if (active.includes(this.state)) return this.transition('failed', correlationId);
    throw new Error(`Illegal runtime transition ${this.state} -> failed`);
  }
}
