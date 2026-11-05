import type { AgentRecommendation, InternetEvidence, LocalLLMProvider } from './types.js';
export interface OllamaProviderOptions {
    endpoint?: string;
    model?: string;
    timeoutMs?: number;
}
export declare class OllamaInternetAdvisor implements LocalLLMProvider {
    private readonly endpoint;
    private readonly model;
    private readonly timeoutMs;
    constructor(options?: OllamaProviderOptions);
    analyze(input: {
        current: InternetEvidence;
        history: readonly InternetEvidence[];
        baseline: AgentRecommendation;
    }): Promise<AgentRecommendation | null>;
}
//# sourceMappingURL=local-llm.d.ts.map