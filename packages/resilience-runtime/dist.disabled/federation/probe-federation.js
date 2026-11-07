import { createHash, createPublicKey, generateKeyPairSync, randomUUID, sign, verify, } from 'node:crypto';
const DEFAULT_LIMITS = {
    maxEvidencePerProbe: 500,
    maxEvidenceTotal: 5000,
    maxEvidenceAgeMs: 15 * 60_000,
    maxClockSkewMs: 5 * 60_000,
};
const MAX_STRING = 256, MAX_METADATA = 16, MAX_METADATA_VALUE = 256;
const bounded = (v) => v.trim().slice(0, MAX_STRING);
const canonical = (v) => Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]))
        : v;
const bytes = (p) => Buffer.from(JSON.stringify(canonical(p)), 'utf8');
const digest = (p) => createHash('sha256').update(bytes(p)).digest('hex');
const keyOf = (pem) => {
    try {
        return createPublicKey(pem);
    }
    catch {
        return null;
    }
};
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const valid = (p) => {
    if (!p ||
        !p.evidenceId ||
        !p.probeId ||
        !p.region ||
        !p.destination ||
        [p.evidenceId, p.probeId, p.region, p.destination].some((v) => v.length > MAX_STRING) ||
        !Number.isFinite(Date.parse(p.observedAt)))
        return false;
    if (!['reachable', 'degraded', 'unreachable', 'unknown'].includes(p.serviceStatus))
        return false;
    const ranges = {
        latencyMs: [0, 300000],
        jitterMs: [0, 300000],
        packetLossPercent: [0, 100],
        dnsLatencyMs: [0, 300000],
        tcpLatencyMs: [0, 300000],
        tlsLatencyMs: [0, 300000],
        httpLatencyMs: [0, 300000],
    };
    for (const [k, v] of Object.entries(p.measurements ?? {})) {
        const r = ranges[k];
        if (!r || !finite(v, r[0], r[1]))
            return false;
    }
    const m = Object.entries(p.metadata ?? {});
    return (m.length <= MAX_METADATA &&
        !m.some(([k, v]) => k.length > MAX_STRING || String(v).length > MAX_METADATA_VALUE));
};
export const createProbeKeyPair = () => {
    const p = generateKeyPairSync('ed25519');
    return {
        publicKeyPem: p.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: p.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
};
export const signProbeEvidence = (payload, privateKeyPem) => ({
    payload,
    signature: sign(null, bytes(payload), privateKeyPem).toString('base64url'),
});
export class ProbeFederation {
    probes = new Map();
    evidence = new Map();
    perProbe = new Map();
    seen = new Set();
    keys = new Map();
    limits;
    constructor(limits = {}) {
        this.limits = { ...DEFAULT_LIMITS, ...limits };
        for (const [k, v] of Object.entries(this.limits))
            if (!Number.isInteger(v) || v < 1)
                throw new Error(`Invalid federation limit: ${k}`);
    }
    registerProbe(input) {
        if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(input.probeId))
            throw new Error('Invalid probeId.');
        const name = bounded(input.name), region = bounded(input.region), key = keyOf(input.publicKeyPem);
        if (!name || !region || !key)
            throw new Error('Invalid probe registration.');
        const old = this.probes.get(input.probeId);
        if (old && old.publicKeyPem !== input.publicKeyPem)
            throw new Error('Probe key replacement requires explicit revocation.');
        const p = old ?? {
            probeId: input.probeId,
            name,
            region,
            publicKeyPem: input.publicKeyPem,
            createdAt: new Date().toISOString(),
            status: 'active',
        };
        this.probes.set(input.probeId, p);
        this.keys.set(input.probeId, key);
        return { ...p };
    }
    revokeProbe(id) {
        const p = this.probes.get(id);
        if (!p || p.status === 'revoked')
            return false;
        p.status = 'revoked';
        this.probes.set(id, p);
        return true;
    }
    listProbes() {
        return [...this.probes.values()].map((p) => ({ ...p }));
    }
    ingest(s, now = Date.now()) {
        const p = s?.payload, id = p?.evidenceId ?? 'unknown', probe = p ? this.probes.get(p.probeId) : undefined;
        if (!probe)
            return { accepted: false, reason: 'unknown-probe', evidenceId: id };
        if (probe.status !== 'active')
            return { accepted: false, reason: 'revoked-probe', evidenceId: id };
        if (!valid(p))
            return { accepted: false, reason: 'invalid-signature', evidenceId: id };
        const t = Date.parse(p.observedAt);
        if (Math.abs(now - t) > this.limits.maxClockSkewMs || now - t > this.limits.maxEvidenceAgeMs)
            return { accepted: false, reason: 'invalid-timestamp', evidenceId: id };
        const key = this.keys.get(p.probeId) ?? keyOf(probe.publicKeyPem);
        if (!key || !verify(null, bytes(p), key, Buffer.from(s.signature, 'base64url')))
            return { accepted: false, reason: 'invalid-signature', evidenceId: id };
        const d = digest(p), list = this.perProbe.get(p.probeId) ?? [];
        if (this.seen.has(d) || this.evidence.has(id))
            return { accepted: false, reason: 'replayed-evidence', evidenceId: id };
        if (this.evidence.size >= this.limits.maxEvidenceTotal ||
            list.length >= this.limits.maxEvidencePerProbe)
            return { accepted: false, reason: 'capacity-limit', evidenceId: id };
        this.evidence.set(id, {
            payload: { ...p, measurements: { ...p.measurements } },
            signature: s.signature,
        });
        list.push(id);
        this.perProbe.set(p.probeId, list);
        this.seen.add(d);
        probe.lastSeenAt = new Date(now).toISOString();
        this.probes.set(probe.probeId, probe);
        return { accepted: true, evidenceId: id };
    }
    listEvidence(o = {}) {
        const n = Math.min(Math.max(o.limit ?? 100, 1), this.limits.maxEvidenceTotal);
        return [...this.evidence.values()]
            .filter((x) => !o.destination || x.payload.destination === o.destination)
            .filter((x) => !o.probeId || x.payload.probeId === o.probeId)
            .sort((a, b) => Date.parse(b.payload.observedAt) - Date.parse(a.payload.observedAt))
            .slice(0, n)
            .map((x) => ({
            payload: { ...x.payload, measurements: { ...x.payload.measurements } },
            signature: x.signature,
        }));
    }
    compareDestination(destination, limit = 100) {
        const a = this.listEvidence({ destination, limit }), r = a.filter((x) => x.payload.serviceStatus === 'reachable').length, d = a.filter((x) => x.payload.serviceStatus === 'degraded').length, u = a.filter((x) => x.payload.serviceStatus === 'unreachable').length, states = [r, d, u].filter((x) => x > 0).length;
        return {
            destination: bounded(destination),
            observedAt: a[0]?.payload.observedAt ?? new Date(0).toISOString(),
            observations: a.map((x) => ({
                probeId: x.payload.probeId,
                region: x.payload.region,
                serviceStatus: x.payload.serviceStatus,
                measurements: { ...x.payload.measurements },
            })),
            reachableCount: r,
            degradedCount: d,
            unreachableCount: u,
            agreement: a.length < 2 ? 'insufficient' : states <= 1 ? 'consistent' : 'mixed',
        };
    }
    stats() {
        return {
            probeCount: this.probes.size,
            activeProbeCount: [...this.probes.values()].filter((p) => p.status === 'active').length,
            evidenceCount: this.evidence.size,
        };
    }
    createLocalEvidence(input) {
        return { ...input, evidenceId: randomUUID() };
    }
}
//# sourceMappingURL=probe-federation.js.map