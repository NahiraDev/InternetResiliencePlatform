import type { AgentRecommendation, InternetEvidence } from './types.js';
import { InternetIntelligenceAgent } from './agent.js';
export interface InternetEvidenceSource {
    read(): Promise<InternetEvidence>;
}
export interface InternetIntelligenceMonitorOptions {
    intervalMs?: number;
    runImmediately?: boolean;
    onRecommendation?: (recommendation: AgentRecommendation) => void | Promise<void>;
}
/**
 * Schedules analysis of an existing IRP evidence source. It never owns probing,
 * routing, policy, tunnel or execution logic.
 */
export declare class InternetIntelligenceMonitor {
    private readonly source;
    private readonly agent;
    private readonly intervalMs;
    private readonly runImmediately;
    private readonly onRecommendation;
    private timer;
    private running;
    constructor(source: InternetEvidenceSource, agent?: InternetIntelligenceAgent, options?: InternetIntelligenceMonitorOptions);
    start(): void;
    stop(): void;
    runOnce(): Promise<AgentRecommendation | null>;
    private collectAndAnalyze;
}
//# sourceMappingURL=monitor.d.ts.map