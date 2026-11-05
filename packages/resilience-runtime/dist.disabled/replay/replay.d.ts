import type { DecisionReplayInput, DecisionReplayResult } from '../domain/types.js';
import { DeterministicPlanner } from '../planning/planner.js';
export declare class DecisionReplayEngine {
    private readonly planner;
    constructor(planner?: DeterministicPlanner);
    replay(input: DecisionReplayInput): Promise<DecisionReplayResult>;
}
//# sourceMappingURL=replay.d.ts.map