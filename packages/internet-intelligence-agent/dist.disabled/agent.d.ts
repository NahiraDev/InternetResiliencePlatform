import type { AgentRecommendation, InternetEvidence, InternetIntelligenceAgentOptions } from './types.js';
export declare class InternetIntelligenceAgent {
    private readonly history;
    private readonly minConfidence;
    private readonly maxHistory;
    private readonly llm;
    constructor(options?: InternetIntelligenceAgentOptions);
    observe(evidence: InternetEvidence): Promise<AgentRecommendation>;
    getHistory(): readonly InternetEvidence[];
}
//# sourceMappingURL=agent.d.ts.map