import type { EventSink } from '../ports/ports.js';
export class InMemoryEventSink implements EventSink {
  readonly events: { event: string; payload: Readonly<Record<string, unknown>> }[] = [];
  async emit(event: string, payload: Readonly<Record<string, unknown>>) {
    this.events.push({ event, payload });
  }
}
export const runtimeEvents = [
  'runtime.cycle.started',
  'runtime.observation.updated',
  'runtime.incident.detected',
  'runtime.policy.evaluated',
  'runtime.plan.created',
  'runtime.plan.rejected',
  'runtime.execution.started',
  'runtime.execution.completed',
  'runtime.execution.failed',
  'runtime.verification.started',
  'runtime.verification.completed',
  'runtime.recovery.started',
  'runtime.recovery.completed',
  'runtime.decision.recorded',
  'runtime.state.changed',
  'runtime.blocked',
  'runtime.degraded',
  'runtime.failed',
] as const;
