import type { DecisionRecord, Incident, RuntimeState } from '../domain/types.js';
import type { DecisionStore, IncidentStore, RuntimeStateStore } from '../ports/ports.js';
export declare class InMemoryDecisionStore implements DecisionStore {
    private rows;
    put(r: DecisionRecord): Promise<void>;
    list(): Promise<DecisionRecord[]>;
    get(id: string): Promise<DecisionRecord | undefined>;
}
export declare class InMemoryIncidentStore implements IncidentStore {
    private rows;
    put(i: Incident): Promise<void>;
    list(): Promise<Incident[]>;
}
export declare class InMemoryRuntimeStateStore implements RuntimeStateStore {
    private state;
    constructor(state?: RuntimeState);
    get(): Promise<RuntimeState>;
    set(s: RuntimeState): Promise<void>;
}
//# sourceMappingURL=memory.d.ts.map