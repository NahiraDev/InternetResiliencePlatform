/**
 * Durable identity contracts for the API. Production wiring uses the PostgreSQL implementation;
 * the in-memory implementation exists only for unit tests and explicitly-labelled development mode.
 */
export type UserStatus = 'pending' | 'active' | 'suspended';
export interface UserRecord {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    status: UserStatus;
    roles: string[];
    permissions: string[];
    emailVerifiedAt: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}
export interface OrganizationRecord {
    id: string;
    name: string;
    slug: string;
    ownerUserId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}
export interface ProjectRecord {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}
export interface WorkspaceRecord {
    id: string;
    organizationId: string;
    projectId?: string;
    name: string;
    slug: string;
    environment: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}
export interface SessionRecord {
    id: string;
    userId: string;
    familyId: string;
    refreshTokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
}
export type OneTimeTokenType = 'email_verification' | 'password_reset';
export interface OneTimeTokenRecord {
    id: string;
    userId: string;
    type: OneTimeTokenType;
    tokenHash: string;
    expiresAt: string;
    consumedAt: string | null;
    createdAt: string;
}
export interface AuditEntry {
    actorUserId?: string | null;
    action: string;
    resource: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
}
export interface PageQuery {
    page: number;
    pageSize: number;
    sort: string;
    order: 'asc' | 'desc';
    search?: string | undefined;
}
export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}
/** Visibility scope: `all` for platform admins, otherwise only organizations owned by the user. */
export type TenantScope = {
    kind: 'all';
} | {
    kind: 'owner';
    userId: string;
};
export declare class DuplicateError extends Error {
    readonly field: string;
    constructor(field: string);
}
export type RotationResult = {
    outcome: 'rotated';
    previous: SessionRecord;
} | {
    outcome: 'reuse';
    previous: SessionRecord;
} | {
    outcome: 'invalid';
};
export interface UserRepository {
    create(user: UserRecord): Promise<UserRecord>;
    findById(id: string): Promise<UserRecord | null>;
    findByEmail(email: string): Promise<UserRecord | null>;
    list(query: PageQuery): Promise<Page<UserRecord>>;
    /** Marks pending user verified and active, applying the granted roles. Idempotent for active users. */
    activate(id: string, at: string, roles: string[], permissions: string[]): Promise<UserRecord | null>;
    setPasswordHash(id: string, passwordHash: string, at: string): Promise<void>;
    touchLogin(id: string, at: string): Promise<void>;
}
export interface SessionRepository {
    create(session: SessionRecord): Promise<void>;
    findByRefreshHash(hash: string): Promise<SessionRecord | null>;
    /** True only for an existing, unrevoked, unexpired session. */
    isActive(id: string, now: string): Promise<boolean>;
    /**
     * Atomically consumes the refresh token (compare-and-set on revokedAt) and stores the successor.
     * A second presentation of an already-rotated token is reported as `reuse`.
     */
    rotate(refreshTokenHash: string, successor: SessionRecord, now: string): Promise<RotationResult>;
    revoke(id: string, now: string): Promise<void>;
    revokeFamily(familyId: string, now: string): Promise<number>;
    revokeAllForUser(userId: string, now: string): Promise<number>;
}
export interface TokenRepository {
    /** Stores a new token and invalidates any outstanding token of the same type for the user. */
    issue(token: OneTimeTokenRecord): Promise<void>;
    /** Atomically consumes an unexpired, unconsumed token; returns null if absent/expired/replayed. */
    consume(type: OneTimeTokenType, tokenHash: string, now: string): Promise<OneTimeTokenRecord | null>;
}
export interface AuditRepository {
    record(entry: AuditEntry): Promise<void>;
    list(filter: {
        action?: string;
        limit?: number;
    }): Promise<Array<AuditEntry & {
        id: string;
        createdAt: string;
    }>>;
}
export interface OrganizationRepository {
    create(org: OrganizationRecord): Promise<OrganizationRecord>;
    findById(id: string, scope: TenantScope): Promise<OrganizationRecord | null>;
    list(query: PageQuery, scope: TenantScope): Promise<Page<OrganizationRecord>>;
    softDelete(id: string, scope: TenantScope, at: string): Promise<boolean>;
}
export interface ProjectRepository {
    create(project: ProjectRecord): Promise<ProjectRecord>;
    findById(id: string, scope: TenantScope): Promise<ProjectRecord | null>;
    list(query: PageQuery, scope: TenantScope): Promise<Page<ProjectRecord>>;
}
export interface WorkspaceRepository {
    create(workspace: WorkspaceRecord): Promise<WorkspaceRecord>;
    findById(id: string, scope: TenantScope): Promise<WorkspaceRecord | null>;
    list(query: PageQuery, scope: TenantScope): Promise<Page<WorkspaceRecord>>;
}
export interface RateLimitDecision {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
}
export interface RateLimitStore {
    /** Atomically counts one hit in a fixed window and reports whether it is within `max`. */
    hit(key: string, max: number, windowMs: number): Promise<RateLimitDecision>;
    /** Reads the current count without incrementing it. */
    peek(key: string): Promise<{
        count: number;
        resetAt: number;
    } | null>;
    reset(key: string): Promise<void>;
}
export interface IdentityRepositories {
    readonly kind: 'postgres' | 'development-memory';
    users: UserRepository;
    sessions: SessionRepository;
    tokens: TokenRepository;
    audit: AuditRepository;
    organizations: OrganizationRepository;
    projects: ProjectRepository;
    workspaces: WorkspaceRepository;
    rateLimits: RateLimitStore;
    /** Throws when the backing store is unreachable. */
    ping(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map