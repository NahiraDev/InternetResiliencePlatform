export type RemoteClientPlatform = 'android' | 'ios' | 'linux' | 'macos' | 'windows' | 'unknown';
export type RemoteClientScope = 'runtime.read' | 'runtime.inspect' | 'autopilot.read' | 'measurements.read' | 'platform.status';
export declare const DEFAULT_REMOTE_CLIENT_SCOPES: readonly RemoteClientScope[];
export declare const REMOTE_CLIENT_SCOPE_SET: Set<RemoteClientScope>;
export declare const sanitizeSecurityMetadata: (metadata: Record<string, unknown> | undefined) => Record<string, unknown>;
export interface DeviceCredential {
    id: string;
    deviceId: string;
    platform: RemoteClientPlatform;
    label?: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
    lastUsedAt?: string;
    secretDigest: Buffer;
}
export interface IssuedDeviceCredential {
    credentialId: string;
    deviceId: string;
    secret: string;
    expiresAt: string;
}
export interface AuthenticatedDevice {
    credentialId: string;
    deviceId: string;
    platform: RemoteClientPlatform;
    label?: string;
    expiresAt: string;
    lastUsedAt: string;
}
export declare class DeviceCredentialService {
    private readonly secretKey;
    private readonly credentials;
    constructor(secretKey: string);
    issue(input: {
        deviceId?: string;
        platform: RemoteClientPlatform;
        label?: string;
        ttlSeconds?: number;
        now?: Date;
    }): IssuedDeviceCredential;
    authenticate(credentialId: string, secret: string, now?: Date): AuthenticatedDevice | null;
    revoke(credentialId: string, now?: Date): boolean;
    revokeDevice(deviceId: string, now?: Date): number;
    activeCount(now?: Date): number;
}
export interface RefreshTokenRecord {
    id: string;
    subject: string;
    issuedAt: string;
    expiresAt: string;
    usedAt?: string;
    revokedAt?: string;
    scopes: readonly string[];
    tokenDigest: Buffer;
}
export interface RotatedRefreshToken {
    tokenId: string;
    token: string;
    subject: string;
    scopes: readonly string[];
    expiresAt: string;
}
export declare class RotatingRefreshTokenStore {
    private readonly secretKey;
    private readonly records;
    constructor(secretKey: string);
    issue(subject: string, scopes: readonly string[], ttlSeconds?: number, now?: Date): RotatedRefreshToken;
    rotate(token: string, now?: Date): RotatedRefreshToken | null;
    revoke(tokenId: string, now?: Date): boolean;
    revokeSubject(subject: string, now?: Date): number;
}
export type SecurityAuditAction = 'client.enrolled' | 'client.authenticated' | 'client.revoked' | 'refresh.rotated' | 'refresh.rejected' | 'authorization.denied';
export interface SecurityAuditEvent {
    id: string;
    at: string;
    action: SecurityAuditAction;
    subjectId?: string;
    deviceId?: string;
    credentialId?: string;
    success: boolean;
    metadata: Record<string, unknown>;
}
export declare class SecurityAuditLog {
    private readonly maxEvents;
    private readonly events;
    constructor(maxEvents?: number);
    record(input: Omit<SecurityAuditEvent, 'id' | 'at' | 'metadata'> & {
        metadata?: Record<string, unknown>;
        at?: string;
    }): SecurityAuditEvent;
    list(limit?: number): readonly SecurityAuditEvent[];
}
export declare const validateRemoteClientScopes: (scopes: readonly string[], allowed?: ReadonlySet<RemoteClientScope>) => RemoteClientScope[];
//# sourceMappingURL=client-security.d.ts.map