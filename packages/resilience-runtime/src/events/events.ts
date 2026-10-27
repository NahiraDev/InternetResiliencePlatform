import type { EventSink } from '../ports/ports.js';

/**
 * In-memory event sink used by tests and local diagnostics.
 *
 * The former `runtimeEvents` array was removed: it was an unversioned,
 * stage-less flat list that duplicated the canonical
 * {@link ../events/event-taxonomy.js | EVENT_TAXONOMY} without version, stage
 * or identity semantics, and its reserved names had drifted from the names the
 * runtime actually emits. `EVENT_TAXONOMY` is the single event-name contract.
 */
export class InMemoryEventSink implements EventSink {
  readonly events: { event: string; payload: Readonly<Record<string, unknown>> }[] = [];
  async emit(event: string, payload: Readonly<Record<string, unknown>>) {
    this.events.push({ event, payload });
  }
}