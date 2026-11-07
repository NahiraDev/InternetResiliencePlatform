/**
 * Phase 94 — Traffic Classification.
 *
 * Pure, deterministic classification of observed flows into traffic classes and
 * application identities. The output feeds the existing routing vocabulary
 * (`routing.application`) consumed by `ProgrammableConnectivityFabric.select`;
 * classification itself never selects or mutates a route.
 */
export const TRAFFIC_CLASSES = [
    'realtime', 'interactive', 'streaming', 'bulk', 'background', 'control', 'unknown',
];
export class ClassificationRuleError extends Error {
    ruleId;
    constructor(ruleId, message) {
        super(`classification rule ${ruleId}: ${message}`);
        this.ruleId = ruleId;
        this.name = 'ClassificationRuleError';
    }
}
export const validateClassificationRules = (rules) => {
    const seen = new Set();
    for (const rule of rules) {
        if (!rule.id.trim())
            throw new ClassificationRuleError(rule.id, 'id is required');
        if (seen.has(rule.id))
            throw new ClassificationRuleError(rule.id, 'duplicate rule id');
        seen.add(rule.id);
        if (!TRAFFIC_CLASSES.includes(rule.trafficClass))
            throw new ClassificationRuleError(rule.id, 'unknown traffic class');
        if (!Number.isFinite(rule.priority))
            throw new ClassificationRuleError(rule.id, 'priority must be finite');
        if (!(rule.confidence >= 0 && rule.confidence <= 1))
            throw new ClassificationRuleError(rule.id, 'confidence must be within [0,1]');
        if (rule.portRange && (rule.portRange[0] > rule.portRange[1] || rule.portRange[0] < 0 || rule.portRange[1] > 65_535)) {
            throw new ClassificationRuleError(rule.id, 'invalid port range');
        }
        for (const port of rule.ports ?? []) {
            if (!Number.isInteger(port) || port < 0 || port > 65_535)
                throw new ClassificationRuleError(rule.id, `invalid port ${port}`);
        }
    }
    return Object.freeze([...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)));
};
const hostMatches = (pattern, host) => {
    const p = pattern.toLowerCase();
    const h = host.toLowerCase();
    if (p.startsWith('*.'))
        return h === p.slice(2) || h.endsWith(p.slice(1));
    return p === h;
};
const ruleMatches = (rule, flow) => {
    if (rule.protocols && !rule.protocols.includes(flow.protocol))
        return false;
    const port = flow.destinationPort;
    if (rule.ports && (port === undefined || !rule.ports.includes(port)))
        return false;
    if (rule.portRange && (port === undefined || port < rule.portRange[0] || port > rule.portRange[1]))
        return false;
    if (rule.hosts && (flow.destinationHost === undefined || !rule.hosts.some((h) => hostMatches(h, flow.destinationHost))))
        return false;
    if (rule.dscp && (flow.dscp === undefined || !rule.dscp.includes(flow.dscp)))
        return false;
    if (rule.minBytesPerSecond !== undefined && (flow.bytesPerSecond ?? 0) < rule.minBytesPerSecond)
        return false;
    if (rule.maxBytesPerSecond !== undefined && (flow.bytesPerSecond ?? 0) > rule.maxBytesPerSecond)
        return false;
    if (rule.maxMeanPacketBytes !== undefined && (flow.meanPacketBytes === undefined || flow.meanPacketBytes > rule.maxMeanPacketBytes))
        return false;
    if (rule.minPacketsPerSecond !== undefined && (flow.packetsPerSecond ?? 0) < rule.minPacketsPerSecond)
        return false;
    return true;
};
/** Conservative built-in rules; deployments may supply their own. */
export const DEFAULT_CLASSIFICATION_RULES = validateClassificationRules([
    { id: 'dns', priority: 10, trafficClass: 'control', application: 'dns', ports: [53, 853], confidence: 0.95 },
    { id: 'ntp', priority: 11, trafficClass: 'control', application: 'ntp', protocols: ['udp'], ports: [123], confidence: 0.95 },
    { id: 'icmp-probe', priority: 12, trafficClass: 'control', application: 'icmp', protocols: ['icmp'], confidence: 0.9 },
    { id: 'dscp-ef-realtime', priority: 20, trafficClass: 'realtime', dscp: [46], confidence: 0.85 },
    { id: 'rtc-udp-ports', priority: 21, trafficClass: 'realtime', application: 'voip', protocols: ['udp'], portRange: [16_384, 32_767], maxMeanPacketBytes: 400, minPacketsPerSecond: 20, confidence: 0.75 },
    { id: 'ssh', priority: 30, trafficClass: 'interactive', application: 'ssh', protocols: ['tcp'], ports: [22], confidence: 0.9 },
    { id: 'https-interactive', priority: 40, trafficClass: 'interactive', application: 'web', protocols: ['tcp', 'quic'], ports: [80, 443, 8_443], maxBytesPerSecond: 500_000, confidence: 0.7 },
    { id: 'https-streaming', priority: 41, trafficClass: 'streaming', application: 'web-media', protocols: ['tcp', 'quic'], ports: [80, 443, 8_443], minBytesPerSecond: 500_001, maxBytesPerSecond: 5_000_000, confidence: 0.65 },
    { id: 'https-bulk', priority: 42, trafficClass: 'bulk', application: 'web-bulk', protocols: ['tcp', 'quic'], ports: [80, 443, 8_443], minBytesPerSecond: 5_000_001, confidence: 0.65 },
    { id: 'rsync-sftp', priority: 50, trafficClass: 'bulk', application: 'file-transfer', protocols: ['tcp'], ports: [21, 873, 2_049], confidence: 0.8 },
    { id: 'background-updates', priority: 60, trafficClass: 'background', application: 'updates', hosts: ['*.windowsupdate.com', '*.swcdn.apple.com', '*.debian.org'], confidence: 0.85 },
]);
const heuristic = (flow) => {
    const bps = flow.bytesPerSecond;
    const pps = flow.packetsPerSecond;
    const size = flow.meanPacketBytes;
    if (pps !== undefined && size !== undefined && pps >= 20 && size <= 400 && flow.protocol === 'udp') {
        return { trafficClass: 'realtime', confidence: 0.5, reasons: ['small-packet-high-rate-udp'] };
    }
    if (bps !== undefined && bps > 5_000_000)
        return { trafficClass: 'bulk', confidence: 0.4, reasons: ['sustained-high-throughput'] };
    if (bps !== undefined && bps > 500_000)
        return { trafficClass: 'streaming', confidence: 0.4, reasons: ['sustained-medium-throughput'] };
    if (bps !== undefined && bps > 0 && bps <= 500_000 && flow.protocol === 'tcp') {
        return { trafficClass: 'interactive', confidence: 0.35, reasons: ['low-rate-tcp'] };
    }
    return undefined;
};
/** Classifies one flow. Evaluation order: explicit rules, application hint, heuristics, default. */
export const classifyFlow = (flow, rules = DEFAULT_CLASSIFICATION_RULES) => {
    const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    for (const rule of ordered) {
        if (!ruleMatches(rule, flow))
            continue;
        const application = rule.application ?? flow.applicationHint;
        return Object.freeze({
            flowId: flow.flowId, trafficClass: rule.trafficClass, ...(application ? { application } : {}),
            ruleId: rule.id, confidence: rule.confidence, basis: 'rule', reasons: Object.freeze([`rule:${rule.id}`]),
        });
    }
    if (flow.applicationHint?.trim()) {
        return Object.freeze({
            flowId: flow.flowId, trafficClass: 'unknown', application: flow.applicationHint.trim(), confidence: 0.3,
            basis: 'hint', reasons: Object.freeze(['application-hint-only']),
        });
    }
    const guess = heuristic(flow);
    if (guess)
        return Object.freeze({ flowId: flow.flowId, ...guess, basis: 'heuristic', reasons: Object.freeze(guess.reasons) });
    return Object.freeze({ flowId: flow.flowId, trafficClass: 'unknown', confidence: 0, basis: 'default', reasons: Object.freeze(['no-matching-rule']) });
};
export const classifyFlows = (flows, rules = DEFAULT_CLASSIFICATION_RULES) => {
    const ordered = validateClassificationRules(rules);
    return Object.freeze([...flows].sort((a, b) => a.flowId.localeCompare(b.flowId)).map((flow) => classifyFlow(flow, ordered)));
};
export const summarizeTrafficMix = (classifications) => {
    const byClass = Object.fromEntries(TRAFFIC_CLASSES.map((c) => [c, 0]));
    const byApplication = {};
    for (const item of classifications) {
        byClass[item.trafficClass] += 1;
        if (item.application)
            byApplication[item.application] = (byApplication[item.application] ?? 0) + 1;
    }
    const total = classifications.length;
    return Object.freeze({ total, byClass: Object.freeze(byClass), byApplication: Object.freeze(byApplication), unclassifiedRatio: total === 0 ? 0 : byClass.unknown / total });
};
/**
 * Compiles a classification into the bounded `routing.*` vocabulary understood
 * by the fabric. The result is read-only evidence; it grants no authority.
 */
export const routingHintsFromClassification = (classification) => Object.freeze({
    ...(classification.application ? { 'routing.application': classification.application } : {}),
    'routing.trafficClass': classification.trafficClass,
});
//# sourceMappingURL=classification.js.map