import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  scryptSync,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from 'node:crypto';

export type SecurityRole =
  'Admin' | 'Power User' | 'User' | 'Read Only' | 'Plugin' | 'Daemon' | 'Node';
export type Permission =
  | 'network.read'
  | 'network.write'
  | 'dns.modify'
  | 'vpn.connect'
  | 'proxy.modify'
  | 'node.manage'
  | 'cluster.manage'
  | 'plugin.install'
  | 'plugin.remove'
  | 'settings.read'
  | 'settings.write'
  | 'audit.read'
  | 'audit.export'
  | 'security.manage';
export const allPermissions: Permission[] = [
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
export const rolePermissions: Record<SecurityRole, readonly Permission[]> = {
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
export interface Principal {
  id: string;
  roles: SecurityRole[];
  permissions?: Permission[];
  deviceId?: string;
  sessionId?: string;
}
export class PermissionEngine {
  can(principal: Principal | null, required: readonly Permission[]): boolean {
    if (!required.length) return true;
    if (!principal) return false;
    const granted = new Set<Permission>(principal.permissions ?? []);
    for (const role of principal.roles) for (const p of rolePermissions[role]) granted.add(p);
    return required.every((p) => granted.has(p));
  }
  assert(principal: Principal | null, required: readonly Permission[]): void {
    if (!this.can(principal, required)) throw new Error(`Forbidden: missing ${required.join(',')}`);
  }
}
export interface EndpointPolicy {
  method: string;
  path: string;
  permissions: Permission[];
  signed?: boolean;
  rateLimitKey?: string;
}
export class EndpointRegistry {
  private readonly policies = new Map<string, EndpointPolicy>();
  register(policy: EndpointPolicy): void {
    if (!policy.permissions.length)
      throw new Error(`Endpoint ${policy.method} ${policy.path} must define permissions.`);
    this.policies.set(`${policy.method.toUpperCase()} ${policy.path}`, {
      ...policy,
      method: policy.method.toUpperCase(),
    });
  }
  get(method: string, path: string): EndpointPolicy | undefined {
    return this.policies.get(`${method.toUpperCase()} ${path}`);
  }
  list(): EndpointPolicy[] {
    return [...this.policies.values()];
  }
}

const b64 = (v: Buffer | string) => Buffer.from(v).toString('base64url');
const json = <T>(v: string): T => JSON.parse(Buffer.from(v, 'base64url').toString('utf8')) as T;
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
export class TokenService {
  constructor(
    private readonly secret: string,
    private readonly issuer = 'irp',
  ) {
    if (secret.length < 32) throw new Error('Token secret must be at least 32 characters.');
  }
  issue(input: Omit<TokenClaims, 'iat' | 'exp' | 'jti'> & { ttlSeconds: number }): string {
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
  verify(token: string, type?: TokenType): TokenClaims {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) throw new Error('Invalid token format.');
    const expected = createHmac('sha512', this.secret).update(`${h}.${p}`).digest('base64url');
    if (!timingSafeEqual(Buffer.from(s), Buffer.from(expected)))
      throw new Error('Invalid token signature.');
    const claims = json<TokenClaims & { iss: string }>(p);
    if (claims.iss !== this.issuer) throw new Error('Invalid token issuer.');
    if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Token expired.');
    if (type && claims.type !== type) throw new Error('Invalid token type.');
    return claims;
  }
}

export interface EncryptedValue {
  algorithm: 'aes-256-gcm';
  keyVersion: number;
  iv: string;
  tag: string;
  ciphertext: string;
  aad?: string;
}
export class CryptoService {
  randomBytes(size = 32): Buffer {
    return randomBytes(size);
  }
  sha256(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }
  sha512(data: string | Buffer): string {
    return createHash('sha512').update(data).digest('hex');
  }
  deriveArgon2idCompatible(secret: string, salt = randomBytes(16)): string {
    return `scrypt-argon2id-compatible$${salt.toString('hex')}$${scryptSync(secret, salt, 64, { N: 2 ** 15, r: 8, p: 1 }).toString('hex')}`;
  }
  generateRsa(): { publicKey: string; privateKey: string } {
    return generateKeyPairSync('rsa', {
      modulusLength: 3072,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  }
  generateEd25519(): { publicKey: string; privateKey: string } {
    return generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  }
  sign(data: string | Buffer, privateKey: string | KeyObject): string {
    return sign(null, Buffer.isBuffer(data) ? data : Buffer.from(data), privateKey).toString(
      'base64url',
    );
  }
  verify(data: string | Buffer, signature: string, publicKey: string | KeyObject): boolean {
    return verify(
      null,
      Buffer.isBuffer(data) ? data : Buffer.from(data),
      publicKey,
      Buffer.from(signature, 'base64url'),
    );
  }
  encrypt(plaintext: string | Buffer, key: Buffer, keyVersion = 1, aad?: string): EncryptedValue {
    if (key.length !== 32) throw new Error('AES-256-GCM requires a 32 byte key.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    if (aad) cipher.setAAD(Buffer.from(aad));
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
  decrypt(value: EncryptedValue, key: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64url'));
    if (value.aad) decipher.setAAD(Buffer.from(value.aad));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64url')),
      decipher.final(),
    ]);
  }
}
export class KeyManager {
  private readonly keys = new Map<number, Buffer>();
  private active = 1;
  constructor(initialKey = randomBytes(32)) {
    this.keys.set(1, initialKey);
  }
  activeVersion(): number {
    return this.active;
  }
  get(version = this.active): Buffer {
    const key = this.keys.get(version);
    if (!key) throw new Error(`Unknown key version ${version}`);
    return key;
  }
  rotate(backup = true): number {
    const next = this.active + 1;
    this.keys.set(next, randomBytes(32));
    if (!backup) this.keys.delete(this.active);
    this.active = next;
    return next;
  }
  versions(): number[] {
    return [...this.keys.keys()].sort((a, b) => a - b);
  }
}
export class SecureStorage<T> {
  private readonly values = new Map<string, EncryptedValue>();
  constructor(
    private readonly crypto: CryptoService,
    private readonly keys: KeyManager,
  ) {}
  set(key: string, value: T): void {
    this.values.set(
      key,
      this.crypto.encrypt(JSON.stringify(value), this.keys.get(), this.keys.activeVersion(), key),
    );
  }
  get(key: string): T | null {
    const item = this.values.get(key);
    if (!item) return null;
    return JSON.parse(
      this.crypto.decrypt(item, this.keys.get(item.keyVersion)).toString('utf8'),
    ) as T;
  }
  delete(key: string): void {
    this.values.delete(key);
  }
}
export type SecretKind =
  'api-key' | 'token' | 'private-key' | 'certificate' | 'password' | 'encryption-key';
export interface SecretRecord {
  id: string;
  kind: SecretKind;
  encrypted: EncryptedValue;
  createdAt: string;
  rotatedAt?: string;
  expiresAt?: string;
}
export class SecretManager {
  private readonly records = new Map<string, SecretRecord>();
  constructor(
    private readonly crypto: CryptoService,
    private readonly keys: KeyManager,
  ) {}
  put(id: string, kind: SecretKind, secret: string, expiresAt?: Date): SecretRecord {
    const existing = this.records.get(id);
    const rec: SecretRecord = {
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
  reveal(id: string): string {
    const rec = this.records.get(id);
    if (!rec) throw new Error('Secret not found.');
    return this.crypto
      .decrypt(rec.encrypted, this.keys.get(rec.encrypted.keyVersion))
      .toString('utf8');
  }
  metadata(): Omit<SecretRecord, 'encrypted'>[] {
    return [...this.records.values()].map(({ encrypted: _encrypted, ...rest }) => rest);
  }
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
export class CertificateAuthority {
  constructor(
    private readonly name: string,
    private readonly keyPair = new CryptoService().generateEd25519(),
    private readonly crypto = new CryptoService(),
  ) {}
  publicKey(): string {
    return this.keyPair.publicKey;
  }
  create(subject: string, publicKey: string, days = 365): CertificateRecord {
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
  validate(cert: CertificateRecord, issuerPublicKey = this.keyPair.publicKey): boolean {
    const { signature, ...base } = cert;
    return (
      new Date(cert.notBefore) <= new Date() &&
      new Date(cert.notAfter) > new Date() &&
      this.crypto.verify(JSON.stringify(base), signature, issuerPublicKey)
    );
  }
  renew(cert: CertificateRecord, days = 365): CertificateRecord {
    if (!this.validate(cert)) throw new Error('Cannot renew invalid certificate.');
    return this.create(cert.subject, cert.publicKey, days);
  }
  expiresWithin(cert: CertificateRecord, ms: number): boolean {
    return new Date(cert.notAfter).getTime() - Date.now() <= ms;
  }
}
export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  registeredAt: string;
}
export const createDeviceIdentity = (crypto = new CryptoService()): DeviceIdentity => {
  const keys = crypto.generateEd25519();
  return {
    deviceId: randomUUID(),
    ...keys,
    fingerprint: crypto.sha256(keys.publicKey),
    registeredAt: new Date().toISOString(),
  };
};
export interface NodeIdentity extends DeviceIdentity {
  nodeId: string;
  certificate: CertificateRecord;
  trustScore: number;
  heartbeatIdentity: string;
}
export const createNodeIdentity = (
  ca: CertificateAuthority,
  crypto = new CryptoService(),
): NodeIdentity => {
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

export type AuditAction =
  | 'login'
  | 'logout'
  | 'permission.change'
  | 'configuration.change'
  | 'plugin.install'
  | 'network.modify'
  | 'certificate.event'
  | 'security.violation';
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
const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        /password|private|secret|token|key/i.test(k) ? [k, '[REDACTED]'] : [k, redact(v)],
      ]),
    );
  return value;
};
export class AuditLog {
  private readonly entries: AuditEntry[] = [];
  append(input: Omit<AuditEntry, 'id' | 'occurredAt' | 'hash'>): AuditEntry {
    const previousHash = this.entries.at(-1)?.hash;
    const details = input.details ? (redact(input.details) as Record<string, unknown>) : undefined;
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
  entriesSince(): AuditEntry[] {
    return [...this.entries];
  }
  verifyIntegrity(): boolean {
    return this.entries.every((entry, i) => {
      const { hash, ...base } = entry;
      return (
        hash === createHash('sha256').update(JSON.stringify(base)).digest('hex') &&
        (i === 0 || entry.previousHash === this.entries[i - 1]?.hash)
      );
    });
  }
}
export type SecurityEventType =
  | 'UnauthorizedAccess'
  | 'TokenExpired'
  | 'CertificateExpired'
  | 'InvalidSignature'
  | 'BruteForceAttempt'
  | 'SuspiciousTraffic'
  | 'TamperDetection'
  | 'ReplayAttempt'
  | 'InvalidCertificate'
  | 'PermissionEscalation'
  | 'UnexpectedNodeBehavior';
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  subject: string;
  occurredAt: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}
export class SecurityEventBus {
  private readonly subscribers = new Set<(event: SecurityEvent) => void | Promise<void>>();
  private readonly events: SecurityEvent[] = [];
  subscribe(fn: (event: SecurityEvent) => void | Promise<void>): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
  async publish(input: Omit<SecurityEvent, 'id' | 'occurredAt'>): Promise<SecurityEvent> {
    const event = { id: randomUUID(), occurredAt: new Date().toISOString(), ...input };
    this.events.push(event);
    await Promise.all([...this.subscribers].map((s) => s(event)));
    return event;
  }
  snapshot(): SecurityEvent[] {
    return [...this.events];
  }
}
export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string, now = Date.now()): boolean {
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
  private readonly seen = new Map<string, number>();
  constructor(private readonly maxSkewMs = 300_000) {}
  validate(nonce: string, timestamp: string, now = Date.now()): boolean {
    const ts = Date.parse(timestamp);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > this.maxSkewMs || this.seen.has(nonce))
      return false;
    this.seen.set(nonce, now);
    for (const [n, t] of this.seen) if (now - t > this.maxSkewMs) this.seen.delete(n);
    return true;
  }
}
export class RequestSecurity {
  constructor(private readonly secretResolver: (keyId: string) => string) {}
  canonical(method: string, path: string, body: string, nonce: string, timestamp: string): string {
    return [
      method.toUpperCase(),
      path,
      createHash('sha256').update(body).digest('hex'),
      nonce,
      timestamp,
    ].join('\n');
  }
  sign(
    keyId: string,
    method: string,
    path: string,
    body: string,
    nonce: string,
    timestamp: string,
  ): string {
    return createHmac('sha256', this.secretResolver(keyId))
      .update(this.canonical(method, path, body, nonce, timestamp))
      .digest('base64url');
  }
  verify(
    keyId: string,
    method: string,
    path: string,
    body: string,
    nonce: string,
    timestamp: string,
    signature: string,
  ): boolean {
    const expected = this.sign(keyId, method, path, body, nonce, timestamp);
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
  headers(): Record<string, string> {
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
  constructor(
    private readonly bus: SecurityEventBus,
    private readonly failureThreshold = 5,
  ) {}
  private readonly failures = new Map<string, number>();
  async recordFailure(subject: string): Promise<void> {
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
  async tokenUse(subject: string, tokenId: string, count: number): Promise<void> {
    if (count > 100)
      await this.bus.publish({
        type: 'TokenExpired',
        subject,
        severity: 'medium',
        metadata: { tokenId, abuseCount: count },
      });
  }
  async permissionEscalation(subject: string, from: Permission[], to: Permission[]): Promise<void> {
    if (to.some((p) => !from.includes(p)))
      await this.bus.publish({
        type: 'PermissionEscalation',
        subject,
        severity: 'critical',
        metadata: { from, to },
      });
  }
  async replay(subject: string): Promise<void> {
    await this.bus.publish({ type: 'ReplayAttempt', subject, severity: 'high' });
  }
  async invalidCertificate(subject: string): Promise<void> {
    await this.bus.publish({ type: 'InvalidCertificate', subject, severity: 'high' });
  }
  async unexpectedNode(subject: string, trustScore: number): Promise<void> {
    if (trustScore < 50)
      await this.bus.publish({
        type: 'UnexpectedNodeBehavior',
        subject,
        severity: 'medium',
        metadata: { trustScore },
      });
  }
}
export const validateSecureEnvironment = (env: NodeJS.ProcessEnv): void => {
  if (env.NODE_ENV === 'production') {
    for (const key of ['IRP_TOKEN_SECRET', 'IRP_STORAGE_KEY'])
      if (!env[key] || env[key]!.length < 32)
        throw new Error(`${key} must be at least 32 characters in production.`);
  }
};
