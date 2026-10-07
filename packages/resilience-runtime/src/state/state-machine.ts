import { nextId, nowIso } from '../domain/ids.js';
import type { RuntimeState, RuntimeTransition } from '../domain/types.js';
import type { EventSink } from '../ports/ports.js';
const active: RuntimeState[] = [
  'idle',
  'observing',
  'analyzing',
  'arbitrating',
  'planning',
  'validating',
  'executing',
  'verifying',
  'recovering',
  'degraded',
  'blocked',
];
const legalTransitions: Readonly<Record<RuntimeState, readonly RuntimeState[]>> = {
  idle: ['observing', 'stopped', 'failed'],
  observing: ['analyzing', 'stopped', 'failed'],
  analyzing: ['arbitrating', 'stopped', 'failed'],
  arbitrating: ['planning', 'stopped', 'failed'],
  planning: ['validating', 'blocked', 'stopped', 'failed'],
  validating: ['executing', 'verifying', 'observing', 'blocked', 'stopped', 'failed'],
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

    // Commit state only after the authoritative state-change event succeeds.
    // This prevents an event-sink failure from leaving the state machine in a
    // state that observers were never told about.
    await this.events?.emit('runtime.state.changed', transition);
    this.state = to;
    // Terminal-state notices use taxonomy-conformant names so they stay valid
    // trace evidence; an unnamed event would be rejected by the taxonomy and
    // would silently drop the outcome from the incident trace.
    if (to === 'blocked') await this.events?.emit('runtime.state.blocked', transition);
    if (to === 'degraded') await this.events?.emit('runtime.state.degraded', transition);
    if (to === 'failed') await this.events?.emit('runtime.state.failed', transition);
    return transition;
  }
  async fail(correlationId = 'state') {
    if (active.includes(this.state)) return this.transition('failed', correlationId);
    throw new Error(`Illegal runtime transition ${this.state} -> failed`);
  }
}
