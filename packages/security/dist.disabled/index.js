import { createCipheriv, createDecipheriv, createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID, scryptSync, sign, timingSafeEqual, verify, } from 'node:crypto';
export const allPermissions = [
    'network.read',
    'network.write',
    'dns.modify',
    'vpn.connect',
    'proxy.modify',
    'node.manage',
    'cluster.manage',
    'plugin.install',
    'plugin.remove',
    'settings.read',
    'settings.write',
    'audit.read',
    'audit.export',
    'security.manage',
];
export const rolePermissions = {
    Admin: allPermissions,
    'Power User': [
        'network.read',
        'network.write',
        'dns.modify',
        'vpn.connect',
        'proxy.modify',
        'plugin.install',
        'plugin.remove',
        'settings.read',
        'settings.write',
        'audit.read',
    ],
    User: ['network.read', 'vpn.connect', 'settings.read'],
    'Read Only': ['network.read', 'settings.read', 'audit.read'],
    Plugin: ['network.read', 'settings.read'],
    Daemon: [
        'network.read',
        'network.write',
        'dns.modify',
        'vpn.connect',
        'proxy.modify',
        'settings.read',
    ],
    Node: ['network.read', 'node.manage'],
};
export class PermissionEngine {
    can(principal, required) {
        if (!required.length)
            return true;
        if (!principal)
            return false;
        const granted = new Set(principal.permissions ?? []);
        for (const role of principal.roles)
            for (const p of rolePermissions[role])
                granted.add(p);
        return required.every((p) => granted.has(p));
    }
    assert(principal, required) {
        if (!this.can(principal, required))
            throw new Error(`Forbidden: missing ${required.join(',')}`);
    }
}
export class EndpointRegistry {
    policies = new Map();
    register(policy) {
        if (!policy.permissions.length)
            throw new Error(`Endpoint ${policy.method} ${policy.path} must define permissions.`);
        this.policies.set(`${policy.method.toUpperCase()} ${policy.path}`, {
            ...policy,
            method: policy.method.toUpperCase(),
        });
    }
    get(method, path) {
        return this.policies.get(`${method.toUpperCase()} ${path}`);
    }
    list() {
        return [...this.policies.values()];
    }
}
const b64 = (v) => Buffer.from(v).toString('base64url');
const json = (v) => JSON.parse(Buffer.from(v, 'base64url').toString('utf8'));
export class TokenService {
    secret;
    issuer;
    constructor(secret, issuer = 'irp') {
        this.secret = secret;
        this.issuer = issuer;
        if (secret.length < 32)
            throw new Error('Token secret must be at least 32 characters.');
    }
    issue(input) {
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: this.issuer,
            ...input,
            iat: now,
            exp: now + input.ttlSeconds,
            jti: randomUUID(),
        };
        const body = `${b64(JSON.stringify({ alg: 'HS512', typ: 'JWT' }))}.${b64(JSON.stringify(payload))}`;
        return `${body}.${createHmac('sha512', this.secret).update(body).digest('base64url')}`;
    }
    verify(token, type) {
        const [h, p, s] = token.split('.');
        if (!h || !p || !s)
            throw new Error('Invalid token format.');
        const expected = createHmac('sha512', this.secret).update(`${h}.${p}`).digest('base64url');
        if (!timingSafeEqual(Buffer.from(s), Buffer.from(expected)))
            throw new Error('Invalid token signature.');
        const claims = json(p);
        if (claims.iss !== this.issuer)
            throw new Error('Invalid token issuer.');
        if (claims.exp <= Math.floor(Date.now() / 1000))
            throw new Error('Token expired.');
        if (type && claims.type !== type)
            throw new Error('Invalid token type.');
        return claims;
    }
}
export class CryptoService {
    randomBytes(size = 32) {
        return randomBytes(size);
    }
    sha256(data) {
        return createHash('sha256').update(data).digest('hex');
    }
    sha512(data) {
        return createHash('sha512').update(data).digest('hex');
    }
    deriveArgon2idCompatible(secret, salt = randomBytes(16)) {
        return `scrypt-argon2id-compatible$${salt.toString('hex')}$${scryptSync(secret, salt, 64, { N: 2 ** 15, r: 8, p: 1 }).toString('hex')}`;
    }
    generateRsa() {
        return generateKeyPairSync('rsa', {
            modulusLength: 3072,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
    }
    generateEd25519() {
        return generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
    }
    sign(data, privateKey) {
        return sign(null, Buffer.isBuffer(data) ? data : Buffer.from(data), privateKey).toString('base64url');
    }
    verify(data, signature, publicKey) {
        return verify(null, Buffer.isBuffer(data) ? data : Buffer.from(data), publicKey, Buffer.from(signature, 'base64url'));
    }
    encrypt(plaintext, key, keyVersion = 1, aad) {
        if (key.length !== 32)
            throw new Error('AES-256-GCM requires a 32 byte key.');
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        if (aad)
            cipher.setAAD(Buffer.from(aad));
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return {
            algorithm: 'aes-256-gcm',
            keyVersion,
            iv: iv.toString('base64url'),
            tag: cipher.getAuthTag().toString('base64url'),
            ciphertext: ciphertext.toString('base64url'),
            ...(aad ? { aad } : {}),
        };
    }
    decrypt(value, key) {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64url'));
        if (value.aad)
            decipher.setAAD(Buffer.from(value.aad));
        decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
        return Buffer.concat([
            decipher.update(Buffer.from(value.ciphertext, 'base64url')),
            decipher.final(),
        ]);
    }
}
export class KeyManager {
    keys = new Map();
    active = 1;
    constructor(initialKey = randomBytes(32)) {
        this.keys.set(1, initialKey);
    }
    activeVersion() {
        return this.active;
    }
    get(version = this.active) {
        const key = this.keys.get(version);
        if (!key)
            throw new Error(`Unknown key version ${version}`);
        return key;
    }
    rotate(backup = true) {
        const next = this.active + 1;
        this.keys.set(next, randomBytes(32));
        if (!backup)
            this.keys.delete(this.active);
        this.active = next;
        return next;
    }
    versions() {
        return [...this.keys.keys()].sort((a, b) => a - b);
    }
}
export class SecureStorage {
    crypto;
    keys;
    values = new Map();
    constructor(crypto, keys) {
        this.crypto = crypto;
        this.keys = keys;
    }
    set(key, value) {
        this.values.set(key, this.crypto.encrypt(JSON.stringify(value), this.keys.get(), this.keys.activeVersion(), key));
    }
    get(key) {
        const item = this.values.get(key);
        if (!item)
            return null;
        return JSON.parse(this.crypto.decrypt(item, this.keys.get(item.keyVersion)).toString('utf8'));
    }
    delete(key) {
        this.values.delete(key);
    }
}
export class SecretManager {
    crypto;
    keys;
    records = new Map();
    constructor(crypto, keys) {
        this.crypto = crypto;
        this.keys = keys;
    }
    put(id, kind, secret, expiresAt) {
        const existing = this.records.get(id);
        const rec = {
            id,
            kind,
            encrypted: this.crypto.encrypt(secret, this.keys.get(), this.keys.activeVersion(), id),
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            ...(existing ? { rotatedAt: new Date().toISOString() } : {}),
            ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
        };
        this.records.set(id, rec);
        return rec;
    }
    reveal(id) {
        const rec = this.records.get(id);
        if (!rec)
            throw new Error('Secret not found.');
        return this.crypto
            .decrypt(rec.encrypted, this.keys.get(rec.encrypted.keyVersion))
            .toString('utf8');
    }
    metadata() {
        return [...this.records.values()].map(({ encrypted: _encrypted, ...rest }) => rest);
    }
}
export class CertificateAuthority {
    name;
    keyPair;
    crypto;
    constructor(name, keyPair = new CryptoService().generateEd25519(), crypto = new CryptoService()) {
        this.name = name;
        this.keyPair = keyPair;
        this.crypto = crypto;
    }
    publicKey() {
        return this.keyPair.publicKey;
    }
    create(subject, publicKey, days = 365) {
        const notBefore = new Date();
        const notAfter = new Date(notBefore.getTime() + days * 86400000);
        const base = {
            id: randomUUID(),
            subject,
            issuer: this.name,
            publicKey,
            serial: randomUUID(),
            notBefore: notBefore.toISOString(),
            notAfter: notAfter.toISOString(),
        };
        return { ...base, signature: this.crypto.sign(JSON.stringify(base), this.keyPair.privateKey) };
    }
    validate(cert, issuerPublicKey = this.keyPair.publicKey) {
        const { signature, ...base } = cert;
        return (new Date(cert.notBefore) <= new Date() &&
            new Date(cert.notAfter) > new Date() &&
            this.crypto.verify(JSON.stringify(base), signature, issuerPublicKey));
    }
    renew(cert, days = 365) {
        if (!this.validate(cert))
            throw new Error('Cannot renew invalid certificate.');
        return this.create(cert.subject, cert.publicKey, days);
    }
    expiresWithin(cert, ms) {
        return new Date(cert.notAfter).getTime() - Date.now() <= ms;
    }
}
export const createDeviceIdentity = (crypto = new CryptoService()) => {
    const keys = crypto.generateEd25519();
    return {
        deviceId: randomUUID(),
        ...keys,
        fingerprint: crypto.sha256(keys.publicKey),
        registeredAt: new Date().toISOString(),
    };
};
export const createNodeIdentity = (ca, crypto = new CryptoService()) => {
    const device = createDeviceIdentity(crypto);
    const nodeId = `node_${device.deviceId}`;
    return {
        ...device,
        nodeId,
        certificate: ca.create(nodeId, device.publicKey),
        trustScore: 100,
        heartbeatIdentity: crypto.sha256(`${nodeId}:${device.fingerprint}`),
    };
};
const redact = (value) => {
    if (Array.isArray(value))
        return value.map(redact);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [
            /password|private|secret|token|key/i.test(k) ? [k, '[REDACTED]'] : [k, redact(v)],
        ]));
    return value;
};
export class AuditLog {
    entries = [];
    append(input) {
        const previousHash = this.entries.at(-1)?.hash;
        const details = input.details ? redact(input.details) : undefined;
        const base = {
            id: randomUUID(),
            ...input,
            ...(details ? { details } : {}),
            occurredAt: new Date().toISOString(),
            ...(previousHash ? { previousHash } : {}),
        };
        const hash = createHash('sha256').update(JSON.stringify(base)).digest('hex');
        const entry = { ...base, hash };
        this.entries.push(entry);
        return entry;
    }
    entriesSince() {
        return [...this.entries];
    }
    verifyIntegrity() {
        return this.entries.every((entry, i) => {
            const { hash, ...base } = entry;
            return (hash === createHash('sha256').update(JSON.stringify(base)).digest('hex') &&
                (i === 0 || entry.previousHash === this.entries[i - 1]?.hash));
        });
    }
}
export class SecurityEventBus {
    subscribers = new Set();
    events = [];
    subscribe(fn) {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }
    async publish(input) {
        const event = { id: randomUUID(), occurredAt: new Date().toISOString(), ...input };
        this.events.push(event);
        await Promise.all([...this.subscribers].map((s) => s(event)));
        return event;
    }
    snapshot() {
        return [...this.events];
    }
}
export class RateLimiter {
    limit;
    windowMs;
    buckets = new Map();
    constructor(limit, windowMs) {
        this.limit = limit;
        this.windowMs = windowMs;
    }
    allow(key, now = Date.now()) {
        const hits = (this.buckets.get(key) ?? []).filter((t) => now - t < this.windowMs);
        if (hits.length >= this.limit) {
            this.buckets.set(key, hits);
            return false;
        }
        hits.push(now);
        this.buckets.set(key, hits);
        return true;
    }
}
export class ReplayProtector {
    maxSkewMs;
    seen = new Map();
    constructor(maxSkewMs = 300_000) {
        this.maxSkewMs = maxSkewMs;
    }
    validate(nonce, timestamp, now = Date.now()) {
        const ts = Date.parse(timestamp);
        if (!Number.isFinite(ts) || Math.abs(now - ts) > this.maxSkewMs || this.seen.has(nonce))
            return false;
        this.seen.set(nonce, now);
        for (const [n, t] of this.seen)
            if (now - t > this.maxSkewMs)
                this.seen.delete(n);
        return true;
    }
}
export class RequestSecurity {
    secretResolver;
    constructor(secretResolver) {
        this.secretResolver = secretResolver;
    }
    canonical(method, path, body, nonce, timestamp) {
        return [
            method.toUpperCase(),
            path,
            createHash('sha256').update(body).digest('hex'),
            nonce,
            timestamp,
        ].join('\n');
    }
    sign(keyId, method, path, body, nonce, timestamp) {
        return createHmac('sha256', this.secretResolver(keyId))
            .update(this.canonical(method, path, body, nonce, timestamp))
            .digest('base64url');
    }
    verify(keyId, method, path, body, nonce, timestamp, signature) {
        const expected = this.sign(keyId, method, path, body, nonce, timestamp);
        return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }
    headers() {
        return {
            'content-security-policy': "default-src 'self'",
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'referrer-policy': 'no-referrer',
            'strict-transport-security': 'max-age=31536000; includeSubDomains',
        };
    }
}
export class ThreatDetector {
    bus;
    failureThreshold;
    constructor(bus, failureThreshold = 5) {
        this.bus = bus;
        this.failureThreshold = failureThreshold;
    }
    failures = new Map();
    async recordFailure(subject) {
        const count = (this.failures.get(subject) ?? 0) + 1;
        this.failures.set(subject, count);
        if (count >= this.failureThreshold)
            await this.bus.publish({
                type: 'BruteForceAttempt',
                subject,
                severity: 'high',
                metadata: { count },
            });
    }
    async tokenUse(subject, tokenId, count) {
        if (count > 100)
            await this.bus.publish({
                type: 'TokenExpired',
                subject,
                severity: 'medium',
                metadata: { tokenId, abuseCount: count },
            });
    }
    async permissionEscalation(subject, from, to) {
        if (to.some((p) => !from.includes(p)))
            await this.bus.publish({
                type: 'PermissionEscalation',
                subject,
                severity: 'critical',
                metadata: { from, to },
            });
    }
    async replay(subject) {
        await this.bus.publish({ type: 'ReplayAttempt', subject, severity: 'high' });
    }
    async invalidCertificate(subject) {
        await this.bus.publish({ type: 'InvalidCertificate', subject, severity: 'high' });
    }
    async unexpectedNode(subject, trustScore) {
        if (trustScore < 50)
            await this.bus.publish({
                type: 'UnexpectedNodeBehavior',
                subject,
                severity: 'medium',
                metadata: { trustScore },
            });
    }
}
export const validateSecureEnvironment = (env) => {
    if (env.NODE_ENV === 'production') {
        for (const key of ['IRP_TOKEN_SECRET', 'IRP_STORAGE_KEY'])
            if (!env[key] || env[key].length < 32)
                throw new Error(`${key} must be at least 32 characters in production.`);
    }
};
export const protectionProfileDefaults = (profile) => {
    const base = {
        requireTunnel: false,
        requireProxy: false,
        requireSecureDns: true,
        allowedInterfaces: [],
        allowedRoutes: [],
        allowedResolvers: [],
        allowedTransports: ['doh', 'dot'],
        protectIpv4: true,
        protectIpv6: true,
        ipv4Policy: 'requireProtected',
        ipv6Policy: 'requireProtected',
        allowDirectTraffic: false,
        failClosed: false,
        killSwitchRequired: false,
        blockOnDnsLeak: true,
        blockOnRouteLeak: true,
        blockOnTunnelFailure: true,
        validationIntervalMs: 30_000,
        stabilizationPeriodMs: 5_000,
        cooldownMs: 10_000,
        minimumFailureThreshold: 1,
        maxConcurrentValidations: 1,
        maxViolationHistory: 100,
        maxRemediationRequests: 10,
    };
    if (profile === 'strict')
        return {
            ...base,
            requireTunnel: true,
            failClosed: true,
            killSwitchRequired: true,
            allowedTransports: ['doh', 'dot', 'doq'],
        };
    if (profile === 'secure')
        return { ...base, requireTunnel: true, failClosed: true };
    if (profile === 'compatibility')
        return {
            ...base,
            ipv4Policy: 'allowDirect',
            ipv6Policy: 'allowDirect',
            allowDirectTraffic: true,
            failClosed: false,
            allowedTransports: ['doh', 'dot', 'udp', 'tcp'],
        };
    return base;
};
export const createTrafficProtectionPolicy = (input) => {
    const policy = { ...protectionProfileDefaults(input.securityProfile), ...input };
    if (policy.validationIntervalMs < 1_000 ||
        policy.maxConcurrentValidations < 1 ||
        policy.maxViolationHistory < 1)
        throw securityErrors.configuration('Invalid Phase 18 resource limits');
    if (policy.securityProfile === 'strict' &&
        (!policy.failClosed || !policy.killSwitchRequired || policy.allowDirectTraffic))
        throw securityErrors.configuration('Strict profile requires failClosed, kill switch, and no direct traffic');
    return policy;
};
export class SecurityLayerError extends Error {
    code;
    classification;
    retryable;
    details;
    constructor(message, code, classification, retryable = false, details = {}) {
        super(message);
        this.code = code;
        this.classification = classification;
        this.retryable = retryable;
        this.details = details;
    }
}
export const securityErrors = {
    configuration: (m, d = {}) => new SecurityLayerError(m, 'SecurityConfigurationError', 'configurationFailure', false, d),
    validation: (m, d = {}) => new SecurityLayerError(m, 'ProtectionValidationFailed', 'securityCritical', true, d),
    resource: (m, d = {}) => new SecurityLayerError(m, 'SecurityResourceLimitExceeded', 'retryable', true, d),
    state: (m, d = {}) => new SecurityLayerError(m, 'SecurityStateConflict', 'nonRetryable', false, d),
};
const severityRank = {
    info: 0,
    warning: 1,
    high: 2,
    critical: 3,
};
const topSeverity = (items) => items.reduce((s, v) => (severityRank[v.severity] > severityRank[s] ? v.severity : s), 'info');
const remediation = (target, action, priority, reason, dryRun = false) => ({ id: randomUUID(), target, action, priority, reason, dryRun });
export const createExpectedNetworkState = (policy) => ({
    allowedInterfaces: [...policy.allowedInterfaces],
    allowedRoutes: [...policy.allowedRoutes],
    ...(policy.allowedTunnel
        ? { requiredTunnel: policy.allowedTunnel }
        : policy.requireTunnel
            ? { requiredTunnel: '*' }
            : {}),
    requiredDns: [...policy.allowedResolvers],
    requiredTransport: [...policy.allowedTransports],
    protectedProtocols: [policy.protectIpv4 ? 'ipv4' : '', policy.protectIpv6 ? 'ipv6' : ''].filter(Boolean),
    ipv4Policy: policy.ipv4Policy,
    ipv6Policy: policy.ipv6Policy,
    failClosed: policy.failClosed,
    killSwitchRequired: policy.killSwitchRequired,
    allowDirectTraffic: policy.allowDirectTraffic,
});
export const snapshotPolicy = (policy, now = new Date()) => ({
    version: policy.version,
    timestamp: now.toISOString(),
    securityProfile: policy.securityProfile,
    trafficPolicy: {
        ...policy,
        allowedInterfaces: [...policy.allowedInterfaces],
        allowedRoutes: [...policy.allowedRoutes],
        allowedResolvers: [...policy.allowedResolvers],
        allowedTransports: [...policy.allowedTransports],
    },
});
const disallowed = (allowed, value) => value && allowed.length > 0 && !allowed.includes(value);
export function detectRouteLeaks(expected, observed) {
    return observed.activeRoutes.map((path) => {
        const wrongInterface = disallowed(expected.allowedInterfaces, path.interface);
        const wrongRoute = disallowed(expected.allowedRoutes, path.route);
        const missingTunnel = Boolean(expected.requiredTunnel &&
            expected.requiredTunnel !== '*' &&
            path.tunnel !== expected.requiredTunnel) || Boolean(expected.requiredTunnel === '*' && !path.tunnel);
        const direct = !expected.allowDirectTraffic && !path.tunnel && !path.proxy;
        const familyBlocked = (path.family === 'ipv4' && expected.ipv4Policy !== 'allowDirect' && !path.tunnel) ||
            (path.family === 'ipv6' && expected.ipv6Policy !== 'allowDirect' && !path.tunnel);
        const detected = Boolean(wrongInterface || wrongRoute || missingTunnel || direct || familyBlocked);
        return {
            detected,
            ...(path.source ? { source: path.source } : {}),
            ...(path.destination ? { destination: path.destination } : {}),
            ...(path.interface ? { interface: path.interface } : {}),
            expected,
            observed: path,
            severity: path.family === 'ipv6' && familyBlocked ? 'critical' : detected ? 'high' : 'info',
            confidence: detected ? 0.95 : 1,
            reason: detected
                ? 'Observed route path violates required tunnel/interface/route policy.'
                : 'Route path matches policy.',
        };
    });
}
export function classifyDnsLeak(expected, observed) {
    if (!observed.dnsResolvers.length || !observed.dnsTransport)
        return 'unknown';
    if (observed.killSwitchState === 'enabled' && !observed.dnsThroughTunnel)
        return 'blocked';
    const badResolver = observed.dnsResolvers.some((r) => disallowed(expected.requiredDns, r));
    const badTransport = disallowed(expected.requiredTransport, observed.dnsTransport);
    const badInterface = disallowed(expected.allowedInterfaces, observed.dnsInterface);
    if ((badResolver || badTransport) && (expected.failClosed || !observed.dnsThroughTunnel))
        return 'confirmedLeak';
    if (badResolver ||
        badTransport ||
        badInterface ||
        (expected.requiredTunnel && !observed.dnsThroughTunnel))
        return 'suspectedLeak';
    return 'noLeak';
}
export function evaluateCompliance(expected, observed) {
    const violations = [];
    for (const leak of detectRouteLeaks(expected, observed).filter((l) => l.detected))
        violations.push({
            type: leak.observed && leak.observed.family === 'ipv6'
                ? 'Ipv6PolicyViolation'
                : 'RoutePolicyViolation',
            severity: leak.severity,
            confidence: leak.confidence,
            expected: leak.expected,
            observed: leak.observed,
            reason: leak.reason,
            remediation: remediation('routing', 'request-route-correction', 90, leak.reason),
        });
    const dns = classifyDnsLeak(expected, observed);
    if (dns === 'confirmedLeak' || dns === 'suspectedLeak' || dns === 'blocked')
        violations.push({
            type: 'DnsPolicyViolation',
            severity: dns === 'confirmedLeak' || dns === 'blocked' ? 'high' : 'warning',
            confidence: dns === 'confirmedLeak' || dns === 'blocked' ? 0.95 : 0.6,
            expected: { resolvers: expected.requiredDns, transports: expected.requiredTransport },
            observed: {
                resolvers: observed.dnsResolvers,
                transport: observed.dnsTransport,
                throughTunnel: observed.dnsThroughTunnel,
            },
            reason: `DNS leak classification: ${dns}.`,
            remediation: remediation('dns-transport', 'switch-secure-dns-transport', 85, 'DNS path does not satisfy resolver or secure transport policy'),
        });
    if (expected.requiredTunnel && observed.tunnelState !== 'connected')
        violations.push({
            type: 'TunnelPolicyViolation',
            severity: expected.failClosed ? 'critical' : 'high',
            confidence: 0.98,
            expected: expected.requiredTunnel,
            observed: observed.tunnelState ?? 'unknown',
            reason: 'Required tunnel is not connected.',
            remediation: remediation('recovery', 'request-tunnel-recovery', 100, 'Required tunnel unavailable'),
        });
    if (expected.killSwitchRequired && observed.killSwitchState !== 'enabled')
        violations.push({
            type: 'KillSwitchViolation',
            severity: expected.failClosed ? 'critical' : 'high',
            confidence: 0.9,
            expected: 'enabled',
            observed: observed.killSwitchState ?? 'unknown',
            reason: 'Kill switch is required but not validated as enabled.',
            remediation: remediation('kernel', 'enable-owned-kill-switch', 95, 'Kill switch required by policy'),
        });
    return violations.sort((a, b) => b.remediation.priority - a.remediation.priority ||
        severityRank[b.severity] - severityRank[a.severity]);
}
export class NetworkSecurityStateMachine {
    stateValue = 'unknown';
    transition(next) {
        const allowed = {
            unknown: ['evaluating', 'failed'],
            evaluating: [
                'protected',
                'degraded',
                'leakDetected',
                'violation',
                'blocked',
                'unprotected',
                'failed',
            ],
            protected: ['evaluating', 'degraded', 'recovering', 'blocked', 'failed'],
            degraded: ['evaluating', 'protected', 'recovering', 'blocked', 'failed'],
            leakDetected: ['evaluating', 'blocked', 'recovering', 'unprotected', 'failed'],
            violation: ['evaluating', 'blocked', 'recovering', 'unprotected', 'failed'],
            blocked: ['evaluating', 'recovering', 'failed'],
            recovering: ['evaluating', 'protected', 'degraded', 'blocked', 'failed'],
            unprotected: ['evaluating', 'protected', 'failed'],
            failed: ['evaluating'],
        };
        if (!allowed[this.stateValue].includes(next))
            throw securityErrors.state(`Invalid security state transition ${this.stateValue} -> ${next}`);
        this.stateValue = next;
        return this.stateValue;
    }
    current() {
        return this.stateValue;
    }
}
export class NetworkSecurityProtectionEngine {
    events;
    metrics;
    killSwitch;
    platform;
    machine = new NetworkSecurityStateMachine();
    inFlight = 0;
    validationVersion = 0;
    violations = [];
    constructor(events, metrics, killSwitch, platform) {
        this.events = events;
        this.metrics = metrics;
        this.killSwitch = killSwitch;
        this.platform = platform;
    }
    async validateProtection(input) {
        if (this.inFlight >= input.policy.maxConcurrentValidations)
            throw securityErrors.resource('Too many concurrent security validations');
        const version = ++this.validationVersion;
        this.inFlight += 1;
        const snapshot = snapshotPolicy(input.policy, input.now?.() ?? new Date());
        const expectedState = createExpectedNetworkState(snapshot.trafficPolicy);
        await this.emit('security.validation.started', { version: snapshot.version });
        this.metric('security_validation_total');
        this.machine.transition(this.machine.current() === 'unknown' ? 'evaluating' : 'evaluating');
        try {
            const violations = evaluateCompliance(expectedState, input.observed);
            const severity = topSeverity(violations);
            let state = violations.length === 0
                ? 'protected'
                : input.policy.failClosed && severityRank[severity] >= severityRank.high
                    ? 'blocked'
                    : 'leakDetected';
            if (state === 'blocked' && this.killSwitch) {
                const ks = await this.killSwitch.enable();
                if (ks !== 'enabled')
                    state = 'failed';
            }
            if (version === this.validationVersion) {
                this.machine.transition(state);
                this.violations = [...violations, ...this.violations].slice(0, input.policy.maxViolationHistory);
            }
            for (const violation of violations)
                await this.emit('security.violation.detected', {
                    type: violation.type,
                    reason: violation.reason,
                });
            if (violations.some((v) => v.type === 'RoutePolicyViolation'))
                this.metric('security_route_leak_total');
            if (violations.some((v) => v.type === 'DnsPolicyViolation'))
                this.metric('security_dns_leak_total');
            if (violations.some((v) => v.type === 'Ipv6PolicyViolation'))
                this.metric('security_ipv6_leak_total');
            if (state === 'blocked')
                this.metric('security_failclosed_total');
            const result = {
                protected: state === 'protected',
                state,
                violations,
                warnings: violations.filter((v) => v.severity === 'warning' || v.severity === 'info'),
                evidence: { policyVersion: snapshot.version, validationVersion: version, bounded: true },
                expectedState,
                observedState: input.observed,
                confidence: violations.length ? Math.min(...violations.map((v) => v.confidence)) : 1,
                timestamp: (input.now?.() ?? new Date()).toISOString(),
            };
            await this.emit('security.validation.completed', { state, violations: violations.length });
            return result;
        }
        catch (e) {
            this.metric('security_validation_failure_total');
            await this.emit('security.validation.failed', {
                error: e instanceof Error ? e.message : 'unknown',
            });
            throw e;
        }
        finally {
            this.inFlight -= 1;
        }
    }
    async activateProtection(policy) {
        const rules = [
            {
                id: `irp-failclosed-${policy.version}`,
                owner: 'InternetResiliencePlatform',
                effect: 'deny',
                protocol: 'any',
                priority: 10_000,
            },
        ];
        await this.platform?.prepare(rules);
        await this.platform?.apply(rules);
        const state = this.killSwitch ? await this.killSwitch.enable() : 'unavailable';
        if (state === 'enabled')
            this.metric('security_killswitch_enabled_total');
        else
            this.metric('security_killswitch_failure_total');
        await this.emit(state === 'enabled' ? 'security.killswitch.enabled' : 'security.killswitch.failed', { state });
        return state;
    }
    async reconcileStartup(policy) {
        const ownedRules = (await this.platform?.status('InternetResiliencePlatform')) ?? [];
        const valid = (await this.platform?.validate('InternetResiliencePlatform')) ?? true;
        const action = policy.failClosed && !valid ? 'repair' : ownedRules.length ? 'preserve' : 'none';
        return {
            ownedRules: ownedRules.filter((r) => r.owner === 'InternetResiliencePlatform'),
            valid,
            action,
        };
    }
    simulateProtection(input) {
        const policy = snapshotPolicy(input.policy, input.now?.() ?? new Date());
        const expectedState = createExpectedNetworkState(input.policy);
        const violations = evaluateCompliance(expectedState, input.observed).map((v) => ({
            ...v,
            remediation: { ...v.remediation, dryRun: true },
        }));
        const severity = topSeverity(violations);
        return {
            policy,
            expectedState,
            observedState: input.observed,
            violations,
            severity,
            confidence: violations.length ? Math.min(...violations.map((v) => v.confidence)) : 1,
            action: violations.length
                ? input.policy.failClosed
                    ? 'blockTraffic'
                    : 'requestRemediation'
                : 'none',
            reason: violations.length
                ? 'Simulation found policy-observation mismatch.'
                : 'Simulation found no protection violations.',
        };
    }
    simulateLeakDetection(input) {
        const expected = createExpectedNetworkState(input.policy);
        return {
            routeLeaks: detectRouteLeaks(expected, input.observed),
            dnsLeak: classifyDnsLeak(expected, input.observed),
            decision: this.simulateProtection(input),
        };
    }
    simulateRemediation(input) {
        return this.simulateProtection(input)
            .violations.slice(0, input.policy.maxRemediationRequests)
            .map((v) => v.remediation);
    }
    history() {
        return [...this.violations];
    }
    metric(name) {
        this.metrics?.record(name, 1);
    }
    async emit(type, payload) {
        await this.events?.publish({
            id: randomUUID(),
            type,
            aggregateId: 'network-security',
            occurredAt: new Date(),
            payload,
        });
    }
}
//# sourceMappingURL=index.js.map