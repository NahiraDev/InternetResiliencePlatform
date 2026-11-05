const diagnoses = new Set([
    'healthy',
    'dns_failure',
    'transport_failure',
    'tls_failure',
    'http_failure',
    'packet_loss',
    'latency_degradation',
    'ipv6_failure',
    'upstream_or_egress_issue',
    'possible_interference',
    'insufficient_evidence',
]);
const kinds = new Set([
    'observe',
    'prefer_resolver',
    'prefer_path',
    'recheck_destination',
    'defer_to_decision_engine',
]);
export class OllamaInternetAdvisor {
    endpoint;
    model;
    timeoutMs;
    constructor(options = {}) {
        this.endpoint = options.endpoint ?? 'http://127.0.0.1:11434/api/generate';
        this.model = options.model ?? 'qwen3:0.6b';
        this.timeoutMs = options.timeoutMs ?? 4_000;
    }
    async analyze(input) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    stream: false,
                    format: 'json',
                    prompt: buildPrompt(input.current, input.history, input.baseline),
                    options: { temperature: 0, num_predict: 180 },
                }),
                signal: controller.signal,
            });
            if (!response.ok)
                return null;
            const body = (await response.json());
            if (typeof body.response !== 'string')
                return null;
            return parseRecommendation(body.response, input.baseline);
        }
        catch {
            return null;
        }
        finally {
            clearTimeout(timer);
        }
    }
}
function buildPrompt(current, history, baseline) {
    return [
        'You are a network diagnostics advisor. Analyze measurements only; never invent facts.',
        'Return JSON only: {"diagnosis":string,"kind":string,"confidence":number,"rationale":string,"evidence":string[]}.',
        'Use only the allowed diagnosis/kind values. Treat possible_interference as a hypothesis, never proof.',
        'Do not propose bypasses, VPNs, circumvention, or arbitrary commands. Recommendations are advisory only.',
        JSON.stringify({ current, history: history.slice(-5), deterministicBaseline: baseline }),
    ].join('\n');
}
function parseRecommendation(raw, baseline) {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.diagnosis !== 'string' ||
            !diagnoses.has(parsed.diagnosis))
            return null;
        if (typeof parsed.kind !== 'string' || !kinds.has(parsed.kind))
            return null;
        if (typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence))
            return null;
        if (typeof parsed.rationale !== 'string')
            return null;
        if (!Array.isArray(parsed.evidence) || parsed.evidence.some((item) => typeof item !== 'string'))
            return null;
        const confidence = Math.min(1, Math.max(0, parsed.confidence));
        // A local model cannot override a materially safer deterministic conclusion without evidence.
        if (baseline.confidence >= 0.95 && parsed.diagnosis !== baseline.diagnosis)
            return null;
        return {
            diagnosis: parsed.diagnosis,
            kind: parsed.kind,
            confidence,
            rationale: parsed.rationale.slice(0, 500),
            evidence: parsed.evidence.slice(0, 8).map((item) => item.slice(0, 160)),
            generatedBy: 'local-llm',
            createdAt: new Date().toISOString(),
        };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=local-llm.js.map