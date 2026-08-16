import type { DecisionRecord, Incident, RuntimeState } from '../domain/types.js';
import type { DecisionStore, IncidentStore, RuntimeStateStore } from '../ports/ports.js';
export class InMemoryDecisionStore implements DecisionStore {
  private rows = new Map<string, DecisionRecord>();
  async put(r: DecisionRecord) {
    this.rows.set(r.decisionId, Object.freeze(r));
  }
  async list() {
    return [...this.rows.values()];
  }
  async get(id: string) {
    return this.rows.get(id);
  }
}
export class InMemoryIncidentStore implements IncidentStore {
  private rows = new Map<string, Incident>();
  async put(i: Incident) {
    this.rows.set(i.id, Object.freeze(i));
  }
  async list() {
    return [...this.rows.values()];
  }
}
export class InMemoryRuntimeStateStore implements RuntimeStateStore {
  constructor(private state: RuntimeState = 'idle') {}
  async get() {
    return this.state;
  }
  async set(s: RuntimeState) {
    this.state = s;
  }
}
