/**
 * Runs the agent as a bounded advisory sidecar. It never selects a candidate,
 * changes policy/security state, or executes a network action.
 */
export class InternetIntelligenceBridge {
    advisor;
    timeoutMs;
    constructor(advisor, options = {}) {
        this.advisor = advisor;
        this.timeoutMs = Math.max(1, Math.min(5_000, options.timeoutMs ?? 400));
    }
    async analyze(context) {
        const evidence = context.internetEvidence;
        if (!evidence)
            return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await Promise.race([
                this.advisor.observe(evidence),
                new Promise((resolve) => controller.signal.addEventListener('abort', () => resolve(null), { once: true })),
            ]);
        }
        catch {
            return null;
        }
        finally {
            clearTimeout(timer);
        }
    }
    modelProvider() {
        return {
            id: 'irp-internet-intelligence-advisor',
            version: '1.0.0',
            capabilities: ['network-diagnosis', 'parameter-analysis', 'advisory-explanation'],
            evaluate: async (context) => {
                const recommendation = await this.analyze(context);
                if (!recommendation)
                    return {};
                return {
                    reasons: [
                        `internet-intelligence:${recommendation.diagnosis}`,
                        `internet-intelligence-confidence:${recommendation.confidence.toFixed(3)}`,
                        ...recommendation.evidence
                            .slice(0, 4)
                            .map((item) => `internet-intelligence-evidence:${item}`),
                    ],
                    explanation: recommendation.rationale.slice(0, 500),
                };
            },
        };
    }
}
//# sourceMappingURL=InternetIntelligenceBridge.js.map