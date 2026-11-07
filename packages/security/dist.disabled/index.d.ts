import { type KeyObject } from 'node:crypto';
export type SecurityRole = 'Admin' | 'Power User' | 'User' | 'Read Only' | 'Plugin' | 'Daemon' | 'Node';
export type Permission = 'network.read' | 'network.write' | 'dns.modify' | 'vpn.connect' | 'proxy.modify' | 'node.manage' | 'cluster.manage' | 'plugin.install' | 'plugin.remove' | 'settings.read' | 'settings.write' | 'audit.read' | 'audit.export' | 'security.manage';
export declare const allPermissions: Permission[];
export declare const rolePermissions: Record<SecurityRole, readonly Permission[]>;
export interface Principal {
    id: string;
    roles: SecurityRole[];
    permissions?: Permission[];
    deviceId?: string;
    sessionId?: string;
}
export declare class PermissionEngine {
    can(principal: Principal | null, required: readonly Permission[]): boolean;
    assert(principal: Principal | null, required: readonly Permission[]): void;
}
export interface EndpointPolicy {
    method: string;
    path: string;
    permissions: Permission[];
    signed?: boolean;
    rateLimitKey?: string;
}
export declare class EndpointRegistry {
    private readonly policies;
    register(policy: EndpointPolicy): void;
    get(method: string, path: string): EndpointPolicy | undefined;
    list(): EndpointPolicy[];
}
export type TokenType = 'jwt' | 'refresh' | 'device' | 'session' | 'api' | 'service' | 'plugin';
export interface TokenClaims {
    sub: string;
    type: TokenType;
    roles: SecurityRole[];
    permissions: Permission[];
    iat: number;
    exp: number;
    jti: string;
    audience?: string;
    deviceId?: string;
}
export declare class TokenService {
    private readonly secret;
    private readonly issuer;
    constructor(secret: string, issuer?: string);
    issue(input: Omit<TokenClaims, 'iat' | 'exp' | 'jti'> & {
        ttlSeconds: number;
    }): string;
    verify(token: string, type?: TokenType): TokenClaims;
}
export interface EncryptedValue {
    algorithm: 'aes-256-gcm';
    keyVersion: number;
    iv: string;
    tag: string;
    ciphertext: string;
    aad?: string;
}
export declare class CryptoService {
    randomBytes(size?: number): Buffer;
    sha256(data: string | Buffer): string;
    sha512(data: string | Buffer): string;
    deriveArgon2idCompatible(secret: string, salt?: NonSharedBuffer): string;
    generateRsa(): {
        publicKey: string;
        privateKey: string;
    };
    generateEd25519(): {
        publicKey: string;
        privateKey: string;
    };
    sign(data: string | Buffer, privateKey: string | KeyObject): string;
    verify(data: string | Buffer, signature: string, publicKey: string | KeyObject): boolean;
    encrypt(plaintext: string | Buffer, key: Buffer, keyVersion?: number, aad?: string): EncryptedValue;
    decrypt(value: EncryptedValue, key: Buffer): Buffer;
}
export declare class KeyManager {
    private readonly keys;
    private active;
    constructor(initialKey?: NonSharedBuffer);
    activeVersion(): number;
    get(version?: number): Buffer;
    rotate(backup?: boolean): number;
    versions(): number[];
}
export declare class SecureStorage<T> {
    private readonly crypto;
    private readonly keys;
    private readonly values;
    constructor(crypto: CryptoService, keys: KeyManager);
    set(key: string, value: T): void;
    get(key: string): T | null;
    delete(key: string): void;
}
export type SecretKind = 'api-key' | 'token' | 'private-key' | 'certificate' | 'password' | 'encryption-key';
export interface SecretRecord {
    id: string;
    kind: SecretKind;
    encrypted: EncryptedValue;
    createdAt: string;
    rotatedAt?: string;
    expiresAt?: string;
}
export declare class SecretManager {
    private readonly crypto;
    private readonly keys;
    private readonly records;
    constructor(crypto: CryptoService, keys: KeyManager);
    put(id: string, kind: SecretKind, secret: string, expiresAt?: Date): SecretRecord;
    reveal(id: string): string;
    metadata(): Omit<SecretRecord, 'encrypted'>[];
}
export interface CertificateRecord {
    id: string;
    subject: string;
    issuer: string;
    publicKey: string;
    serial: string;
    notBefore: string;
    notAfter: string;
    signature: string;
}
export declare class CertificateAuthority {
    private readonly name;
    private readonly keyPair;
    private readonly crypto;
    constructor(name: string, keyPair?: {
        publicKey: string;
        privateKey: string;
    }, crypto?: CryptoService);
    publicKey(): string;
    create(subject: string, publicKey: string, days?: number): CertificateRecord;
    validate(cert: CertificateRecord, issuerPublicKey?: string): boolean;
    renew(cert: CertificateRecord, days?: number): CertificateRecord;
    expiresWithin(cert: CertificateRecord, ms: number): boolean;
}
export interface DeviceIdentity {
    deviceId: string;
    publicKey: string;
    privateKey: string;
    fingerprint: string;
    registeredAt: string;
}
export declare const createDeviceIdentity: (crypto?: CryptoService) => DeviceIdentity;
export interface NodeIdentity extends DeviceIdentity {
    nodeId: string;
    certificate: CertificateRecord;
    trustScore: number;
    heartbeatIdentity: string;
}
export declare const createNodeIdentity: (ca: CertificateAuthority, crypto?: CryptoService) => NodeIdentity;
export type AuditAction = 'login' | 'logout' | 'permission.change' | 'configuration.change' | 'plugin.install' | 'network.modify' | 'certificate.event' | 'security.violation';
export interface AuditEntry {
    id: string;
    action: AuditAction;
    actorId: string;
    target: string;
    occurredAt: string;
    outcome: 'success' | 'failure';
    details?: Record<string, unknown>;
    hash: string;
    previousHash?: string;
}
export declare class AuditLog {
    private readonly entries;
    append(input: Omit<AuditEntry, 'id' | 'occurredAt' | 'hash'>): AuditEntry;
    entriesSince(): AuditEntry[];
    verifyIntegrity(): boolean;
}
export type SecurityEventType = 'UnauthorizedAccess' | 'TokenExpired' | 'CertificateExpired' | 'InvalidSignature' | 'BruteForceAttempt' | 'SuspiciousTraffic' | 'TamperDetection' | 'ReplayAttempt' | 'InvalidCertificate' | 'PermissionEscalation' | 'UnexpectedNodeBehavior';
export interface SecurityEvent {
    id: string;
    type: SecurityEventType;
    subject: string;
    occurredAt: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, unknown>;
}
export declare class SecurityEventBus {
    private readonly subscribers;
    private readonly events;
    subscribe(fn: (event: SecurityEvent) => void | Promise<void>): () => void;
    publish(input: Omit<SecurityEvent, 'id' | 'occurredAt'>): Promise<SecurityEvent>;
    snapshot(): SecurityEvent[];
}
export declare class RateLimiter {
    private readonly limit;
    private readonly windowMs;
    private readonly buckets;
    constructor(limit: number, windowMs: number);
    allow(key: string, now?: number): boolean;
}
export declare class ReplayProtector {
    private readonly maxSkewMs;
    private readonly seen;
    constructor(maxSkewMs?: number);
    validate(nonce: string, timestamp: string, now?: number): boolean;
}
export declare class RequestSecurity {
    private readonly secretResolver;
    constructor(secretResolver: (keyId: string) => string);
    canonical(method: string, path: string, body: string, nonce: string, timestamp: string): string;
    sign(keyId: string, method: string, path: string, body: string, nonce: string, timestamp: string): string;
    verify(keyId: string, method: string, path: string, body: string, nonce: string, timestamp: string, signature: string): boolean;
    headers(): Record<string, string>;
}
export declare class ThreatDetector {
    private readonly bus;
    private readonly failureThreshold;
    constructor(bus: SecurityEventBus, failureThreshold?: number);
    private readonly failures;
    recordFailure(subject: string): Promise<void>;
    tokenUse(subject: string, tokenId: string, count: number): Promise<void>;
    permissionEscalation(subject: string, from: Permission[], to: Permission[]): Promise<void>;
    replay(subject: string): Promise<void>;
    invalidCertificate(subject: string): Promise<void>;
    unexpectedNode(subject: string, trustScore: number): Promise<void>;
}
export declare const validateSecureEnvironment: (env: NodeJS.ProcessEnv) => void;
export type NetworkSecurityState = 'unknown' | 'evaluating' | 'protected' | 'degraded' | 'leakDetected' | 'violation' | 'blocked' | 'recovering' | 'unprotected' | 'failed';
export type ProtectionProfile = 'strict' | 'secure' | 'balanced' | 'compatibility';
export type AddressFamilyPolicy = 'requireProtected' | 'blockIfUnprotected' | 'allowDirect' | 'disabled';
export type ProtectionSeverity = 'info' | 'warning' | 'high' | 'critical';
export type DnsLeakClassification = 'noLeak' | 'suspectedLeak' | 'confirmedLeak' | 'blocked' | 'unknown';
export type KillSwitchState = 'unavailable' | 'disabled' | 'preparing' | 'enabled' | 'degraded' | 'failed' | 'validating';
export type ProtectionAction = 'none' | 'monitor' | 'blockTraffic' | 'enableKillSwitch' | 'requestRemediation' | 'degrade' | 'fail';
export type ViolationType = 'RoutePolicyViolation' | 'DnsPolicyViolation' | 'TunnelPolicyViolation' | 'InterfacePolicyViolation' | 'Ipv4PolicyViolation' | 'Ipv6PolicyViolation' | 'TransportPolicyViolation' | 'KillSwitchViolation' | 'ConfigurationViolation';
export type SecurityErrorClassification = 'retryable' | 'nonRetryable' | 'securityCritical' | 'policyFailure' | 'configurationFailure' | 'dependencyFailure';
export interface TrafficProtectionPolicy {
    version: string;
    securityProfile: ProtectionProfile;
    requireTunnel: boolean;
    requireProxy: boolean;
    requireSecureDns: boolean;
    allowedInterfaces: string[];
    allowedRoutes: string[];
    allowedResolvers: string[];
    allowedTransports: string[];
    allowedTunnel?: string;
    protectIpv4: boolean;
    protectIpv6: boolean;
    ipv4Policy: AddressFamilyPolicy;
    ipv6Policy: AddressFamilyPolicy;
    allowDirectTraffic: boolean;
    failClosed: boolean;
    killSwitchRequired: boolean;
    blockOnDnsLeak: boolean;
    blockOnRouteLeak: boolean;
    blockOnTunnelFailure: boolean;
    validationIntervalMs: number;
    stabilizationPeriodMs: number;
    cooldownMs: number;
    minimumFailureThreshold: number;
    maxConcurrentValidations: number;
    maxViolationHistory: number;
    maxRemediationRequests: number;
}
export declare const protectionProfileDefaults: (profile: ProtectionProfile) => Omit<TrafficProtectionPolicy, "version" | "securityProfile">;
export declare const createTrafficProtectionPolicy: (input: Partial<TrafficProtectionPolicy> & {
    version: string;
    securityProfile: ProtectionProfile;
}) => TrafficProtectionPolicy;
export interface PolicySnapshot {
    version: string;
    timestamp: string;
    securityProfile: ProtectionProfile;
    trafficPolicy: TrafficProtectionPolicy;
}
export interface TrafficPath {
    source?: string;
    destination?: string;
    interface?: string;
    route?: string;
    gateway?: string;
    tunnel?: string;
    proxy?: string;
    dnsContext?: string;
    transport?: string;
    securityProfile: ProtectionProfile;
    state: NetworkSecurityState;
    family?: 'ipv4' | 'ipv6';
}
export interface ExpectedNetworkState {
    allowedInterfaces: string[];
    allowedRoutes: string[];
    requiredTunnel?: string;
    requiredProxy?: string;
    requiredDns: string[];
    requiredTransport: string[];
    protectedProtocols: string[];
    ipv4Policy: AddressFamilyPolicy;
    ipv6Policy: AddressFamilyPolicy;
    failClosed: boolean;
    killSwitchRequired: boolean;
    allowDirectTraffic: boolean;
}
export interface ObservedNetworkState {
    activeInterfaces: string[];
    activeRoutes: TrafficPath[];
    defaultRoute?: TrafficPath;
    dnsResolvers: string[];
    dnsTransport?: string;
    dnsInterface?: string;
    dnsThroughTunnel: boolean;
    tunnelId?: string;
    tunnelState?: 'connected' | 'degraded' | 'disconnected' | 'failed' | 'recovering' | 'unknown';
    proxyId?: string;
    proxyState?: 'connected' | 'degraded' | 'disconnected' | 'failed' | 'unknown';
    ipv4Enabled: boolean;
    ipv6Enabled: boolean;
    connectivityState?: string;
    killSwitchState?: KillSwitchState;
    timestamp: string;
}
export interface SecurityViolation {
    type: ViolationType;
    severity: ProtectionSeverity;
    confidence: number;
    expected: unknown;
    observed: unknown;
    reason: string;
    remediation: RemediationRequest;
}
export interface RemediationRequest {
    id: string;
    target: 'routing' | 'dns' | 'dns-transport' | 'tunnel' | 'recovery' | 'kernel' | 'configuration';
    action: string;
    priority: number;
    reason: string;
    dryRun: boolean;
}
export interface RouteLeak {
    detected: boolean;
    source?: string;
    destination?: string;
    interface?: string;
    expected: unknown;
    observed: unknown;
    severity: ProtectionSeverity;
    confidence: number;
    reason: string;
}
export interface ProtectionValidationResult {
    protected: boolean;
    state: NetworkSecurityState;
    violations: SecurityViolation[];
    warnings: SecurityViolation[];
    evidence: Record<string, unknown>;
    expectedState: ExpectedNetworkState;
    observedState: ObservedNetworkState;
    confidence: number;
    timestamp: string;
}
export interface SecurityDecision {
    policy: PolicySnapshot;
    expectedState: ExpectedNetworkState;
    observedState: ObservedNetworkState;
    violations: SecurityViolation[];
    severity: ProtectionSeverity;
    confidence: number;
    action: ProtectionAction;
    reason: string;
}
export interface Phase18EventBus {
    publish(event: {
        id: string;
        type: string;
        aggregateId: string;
        occurredAt: Date;
        payload: unknown;
        metadata?: Record<string, string>;
    }): Promise<void>;
}
export interface Phase18Metrics {
    record(name: string, value: number, labels?: Record<string, string>): void;
}
export interface PlatformSecurityAdapter {
    owner: string;
    prepare(policy: FirewallPolicy[]): Promise<void>;
    apply(policy: FirewallPolicy[]): Promise<void>;
    rollback(owner: string): Promise<void>;
    status(owner: string): Promise<FirewallPolicy[]>;
    validate(owner: string): Promise<boolean>;
}
export interface FirewallPolicy {
    id: string;
    owner: 'InternetResiliencePlatform';
    effect: 'allow' | 'deny';
    interface?: string;
    destination?: string;
    protocol?: 'tcp' | 'udp' | 'icmp' | 'any';
    port?: number;
    priority: number;
}
export interface Phase18KillSwitch {
    prepare(): Promise<KillSwitchState>;
    enable(): Promise<KillSwitchState>;
    disable(): Promise<KillSwitchState>;
    status(): Promise<KillSwitchState>;
    validate(): Promise<boolean>;
}
export interface ProtectionSources {
    policy: TrafficProtectionPolicy;
    observed: ObservedNetworkState;
    now?: () => Date;
}
export declare class SecurityLayerError extends Error {
    readonly code: string;
    readonly classification: SecurityErrorClassification;
    readonly retryable: boolean;
    readonly details: Record<string, unknown>;
    constructor(message: string, code: string, classification: SecurityErrorClassification, retryable?: boolean, details?: Record<string, unknown>);
}
export declare const securityErrors: {
    configuration: (m: string, d?: Record<string, unknown>) => SecurityLayerError;
    validation: (m: string, d?: Record<string, unknown>) => SecurityLayerError;
    resource: (m: string, d?: Record<string, unknown>) => SecurityLayerError;
    state: (m: string, d?: Record<string, unknown>) => SecurityLayerError;
};
export declare const createExpectedNetworkState: (policy: TrafficProtectionPolicy) => ExpectedNetworkState;
export declare const snapshotPolicy: (policy: TrafficProtectionPolicy, now?: Date) => PolicySnapshot;
export declare function detectRouteLeaks(expected: ExpectedNetworkState, observed: ObservedNetworkState): RouteLeak[];
export declare function classifyDnsLeak(expected: ExpectedNetworkState, observed: ObservedNetworkState): DnsLeakClassification;
export declare function evaluateCompliance(expected: ExpectedNetworkState, observed: ObservedNetworkState): SecurityViolation[];
export declare class NetworkSecurityStateMachine {
    private stateValue;
    transition(next: NetworkSecurityState): NetworkSecurityState;
    current(): NetworkSecurityState;
}
export declare class NetworkSecurityProtectionEngine {
    private readonly events?;
    private readonly metrics?;
    private readonly killSwitch?;
    private readonly platform?;
    private readonly machine;
    private inFlight;
    private validationVersion;
    private violations;
    constructor(events?: Phase18EventBus | undefined, metrics?: Phase18Metrics | undefined, killSwitch?: Phase18KillSwitch | undefined, platform?: PlatformSecurityAdapter | undefined);
    validateProtection(input: ProtectionSources): Promise<ProtectionValidationResult>;
    activateProtection(policy: TrafficProtectionPolicy): Promise<KillSwitchState>;
    reconcileStartup(policy: TrafficProtectionPolicy): Promise<{
        ownedRules: FirewallPolicy[];
        valid: boolean;
        action: 'preserve' | 'repair' | 'none';
    }>;
    simulateProtection(input: ProtectionSources): SecurityDecision;
    simulateLeakDetection(input: ProtectionSources): {
        routeLeaks: RouteLeak[];
        dnsLeak: DnsLeakClassification;
        decision: SecurityDecision;
    };
    simulateRemediation(input: ProtectionSources): RemediationRequest[];
    history(): SecurityViolation[];
    private metric;
    private emit;
}
//# sourceMappingURL=index.d.ts.map