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
/**
 * Visibility scope: `all` for platform admins, otherwise organizations the user owns or is an active
 * member of (and everything inside them).
 */
export type TenantScope = { kind: 'all' } | { kind: 'user'; userId: string };

/** Roles a membership can grant. Ownership is `Organization.ownerUserId`, not a membership. */
export const MEMBER_ROLES = ['admin', 'member', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type OrganizationRole = 'owner' | MemberRole;
export type MembershipStatus = 'active' | 'suspended';
export interface MembershipRecord {
  organizationId: string;
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

/** Optimistic concurrency: the caller's `expectedUpdatedAt` no longer matches the stored row. */
export class StaleWriteError extends Error {
  constructor() {
    super('Resource was modified by another request');
    this.name = 'StaleWriteError';
  }
}
/** The parent (organization or project) is absent, archived, or belongs to another organization. */
export class MissingParentError extends Error {
  constructor(readonly parent: 'organization' | 'project') {
    super(`Missing parent ${parent}`);
    this.name = 'MissingParentError';
  }
}

export class DuplicateError extends Error {
  constructor(readonly field: string) {
    super(`Duplicate ${field}`);
    this.name = 'DuplicateError';
  }
}

export type RotationResult =
  | { outcome: 'rotated'; previous: SessionRecord }
  | { outcome: 'reuse'; previous: SessionRecord }
  | { outcome: 'invalid' };

export interface UserRepository {
  create(user: UserRecord): Promise<UserRecord>;
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  list(query: PageQuery): Promise<Page<UserRecord>>;
  /** Marks pending user verified and active, applying the granted roles. Idempotent for active users. */
  activate(
    id: string,
    at: string,
    roles: string[],
    permissions: string[],
  ): Promise<UserRecord | null>;
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
  consume(
    type: OneTimeTokenType,
    tokenHash: string,
    now: string,
  ): Promise<OneTimeTokenRecord | null>;
}
export interface AuditRepository {
  record(entry: AuditEntry): Promise<void>;
  list(filter: {
    action?: string;
    limit?: number;
  }): Promise<Array<AuditEntry & { id: string; createdAt: string }>>;
}
export interface UpdateOptions {
  at: string;
  /** When set, the write applies only if the row is still at this version, else StaleWriteError. */
  expectedUpdatedAt?: string | undefined;
}
export type OrganizationPatch = { name?: string; slug?: string };
export type ProjectPatch = { name?: string; slug?: string; description?: string | null };
export type WorkspacePatch = {
  name?: string;
  slug?: string;
  environment?: string;
  projectId?: string;
};
export interface ParentFilter {
  organizationId?: string;
  projectId?: string;
}
export interface OrganizationRepository {
  create(org: OrganizationRecord): Promise<OrganizationRecord>;
  findById(id: string, scope: TenantScope): Promise<OrganizationRecord | null>;
  list(query: PageQuery, scope: TenantScope): Promise<Page<OrganizationRecord>>;
  update(id: string, patch: OrganizationPatch, options: UpdateOptions): Promise<OrganizationRecord | null>;
  /** Archives the organization with its projects and workspaces in one transaction. */
  archive(id: string, at: string): Promise<boolean>;
  /** The user's role in a live organization: owner, an active membership's role, or null. */
  roleOf(id: string, userId: string): Promise<OrganizationRole | null>;
  /**
   * Makes an active member the owner; the previous owner becomes an admin member. Returns null when
   * the organization is gone or the target is not an active member.
   */
  transferOwnership(id: string, newOwnerUserId: string, at: string): Promise<OrganizationRecord | null>;
}
export interface MembershipRepository {
  /** Active and suspended members (never removed ones, never the owner). */
  list(organizationId: string, query: PageQuery): Promise<Page<MembershipRecord>>;
  find(organizationId: string, userId: string): Promise<MembershipRecord | null>;
  /** Adds or re-adds a member. DuplicateError if already a member or the owner. */
  add(organizationId: string, userId: string, role: MemberRole, at: string): Promise<MembershipRecord>;
  update(
    organizationId: string,
    userId: string,
    patch: { role?: MemberRole; status?: MembershipStatus },
    at: string,
  ): Promise<MembershipRecord | null>;
  remove(organizationId: string, userId: string, at: string): Promise<boolean>;
}
export interface ProjectRepository {
  /** MissingParentError when the organization is absent or archived. */
  create(project: ProjectRecord): Promise<ProjectRecord>;
  findById(id: string, scope: TenantScope): Promise<ProjectRecord | null>;
  list(query: PageQuery, scope: TenantScope, parent?: ParentFilter): Promise<Page<ProjectRecord>>;
  update(id: string, patch: ProjectPatch, options: UpdateOptions): Promise<ProjectRecord | null>;
  /** Archives the project and its workspaces in one transaction. */
  archive(id: string, at: string): Promise<boolean>;
}
export interface WorkspaceRepository {
  /** MissingParentError when the organization or the referenced project cannot be a parent. */
  create(workspace: WorkspaceRecord): Promise<WorkspaceRecord>;
  findById(id: string, scope: TenantScope): Promise<WorkspaceRecord | null>;
  list(query: PageQuery, scope: TenantScope, parent?: ParentFilter): Promise<Page<WorkspaceRecord>>;
  /** A `projectId` patch must name a live project of the workspace's own organization. */
  update(id: string, patch: WorkspacePatch, options: UpdateOptions): Promise<WorkspaceRecord | null>;
  archive(id: string, at: string): Promise<boolean>;
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
  peek(key: string): Promise<{ count: number; resetAt: number } | null>;
  reset(key: string): Promise<void>;
}
export interface RetentionPolicy {
  /** Expired sessions/tokens are kept this long past expiry (refresh-token reuse detection, support). */
  graceMs: number;
  /** Audit rows older than this are deleted. `null` keeps audit logs forever (the default). */
  auditRetentionMs: number | null;
}
export interface RetentionResult {
  sessions: number;
  tokens: number;
  rateLimitBuckets: number;
  auditLogs: number;
}
export interface RetentionStore {
  /** Deletes expired identity data. Safe to run concurrently from several API instances. */
  purgeExpired(policy: RetentionPolicy, now?: Date): Promise<RetentionResult>;
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
  memberships: MembershipRepository;
  rateLimits: RateLimitStore;
  retention: RetentionStore;
  /** Throws when the backing store is unreachable. */
  ping(): Promise<void>;
  close(): Promise<void>;
}
