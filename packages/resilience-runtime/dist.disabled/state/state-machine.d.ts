import type { RuntimeState, RuntimeTransition } from '../domain/types.js';
import type { EventSink } from '../ports/ports.js';
export declare class RuntimeStateMachine {
    private readonly events?;
    private state;
    constructor(initial?: RuntimeState, events?: EventSink | undefined);
    current(): RuntimeState;
    transition(to: RuntimeState, correlationId?: string): Promise<RuntimeTransition>;
    fail(correlationId?: string): Promise<RuntimeTransition>;
}
//# sourceMappingURL=state-machine.d.ts.map