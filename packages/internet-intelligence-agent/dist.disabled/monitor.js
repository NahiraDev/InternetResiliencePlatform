import { InternetIntelligenceAgent } from './agent.js';
/**
 * Schedules analysis of an existing IRP evidence source. It never owns probing,
 * routing, policy, tunnel or execution logic.
 */
export class InternetIntelligenceMonitor {
    source;
    agent;
    intervalMs;
    runImmediately;
    onRecommendation;
    timer;
    running;
    constructor(source, agent = new InternetIntelligenceAgent(), options = {}) {
        this.source = source;
        this.agent = agent;
        this.intervalMs = Math.max(1_000, Math.min(86_400_000, options.intervalMs ?? 60_000));
        this.runImmediately = options.runImmediately ?? true;
        this.onRecommendation = options.onRecommendation;
    }
    start() {
        if (this.timer)
            return;
        if (this.runImmediately)
            void this.runOnce();
        this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    async runOnce() {
        if (this.running)
            return null;
        this.running = this.collectAndAnalyze();
        try {
            return await this.running;
        }
        finally {
            this.running = undefined;
        }
    }
    async collectAndAnalyze() {
        try {
            const evidence = await this.source.read();
            const recommendation = await this.agent.observe(evidence);
            await this.onRecommendation?.(recommendation);
            return recommendation;
        }
        catch {
            // Intelligence is advisory; evidence/probe failures must not stop the control loop.
            return null;
        }
    }
}
//# sourceMappingURL=monitor.js.map