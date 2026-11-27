import { randomUUID } from 'node:crypto';
import {
  DuplicateError,
  MissingParentError,
  StaleWriteError,
  type MemberRole,
  type MembershipRecord,
  type MembershipStatus,
  type UpdateOptions,
  type AuditEntry,
  type IdentityRepositories,
  type OneTimeTokenRecord,
  type OrganizationRecord,
  type Page,
  type PageQuery,
  type ProjectRecord,
  type RateLimitDecision,
  type RotationResult,
  type SessionRecord,
  type TenantScope,
  type UserRecord,
  type WorkspaceRecord,
} from './types.js';

/**
 * Process-local repositories. NOT durable and NOT shared between API instances.
 * Allowed only for unit tests and explicitly-labelled development mode (see resolveIdentityRepositories).
 */
const paginate = <T extends object>(
  rows: T[],
  q: PageQuery,
  sortable: readonly string[],
): Page<T> => {
  const key = sortable.includes(q.sort) ? q.sort : 'createdAt';
  const sorted = [...rows].sort((a, b) => {
    const cmp = String((a as Record<string, unknown>)[key] ?? '').localeCompare(
      String((b as Record<string, unknown>)[key] ?? ''),
    );
    return q.order === 'asc' ? cmp : -cmp;
  });
  const start = (q.page - 1) * q.pageSize;
  return {
    items: sorted.slice(start, start + q.pageSize),
    total: sorted.length,
    page: q.page,
    pageSize: q.pageSize,
  };
};
const matches = (needle: string | undefined, ...fields: Array<string | undefined>) =>
  !needle || fields.some((f) => (f ?? '').toLowerCase().includes(needle.toLowerCase()));

export const createMemoryIdentityRepositories = (): IdentityRepositories => {
  const users = new Map<string, UserRecord>();
  const orgs = new Map<string, OrganizationRecord>();
  const projects = new Map<string, ProjectRecord>();
  const workspaces = new Map<string, WorkspaceRecord>();
  const sessions = new Map<string, SessionRecord>();
  const tokens = new Map<string, OneTimeTokenRecord>();
  const audit: Array<AuditEntry & { id: string; createdAt: string }> = [];
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const live = <T extends { deletedAt: string | null }>(m: Map<string, T>) =>
    [...m.values()].filter((r) => !r.deletedAt);
  type Member = { role: MemberRole; status: MembershipStatus | 'removed'; createdAt: string; updatedAt: string };
  const members = new Map<string, Member>(); // key: `${organizationId}:${userId}`
  const visibleOrg = (o: OrganizationRecord, s: TenantScope) =>
    s.kind === 'all' || o.ownerUserId === s.userId || members.get(`${o.id}:${s.userId}`)?.status === 'active';
  const visibleOrgId = (orgId: string, s: TenantScope) => {
    const o = orgs.get(orgId);
    return !!o && !o.deletedAt && visibleOrg(o, s);
  };
  const liveOrg = (id: string) => {
    const o = orgs.get(id);
    return o && !o.deletedAt ? o : null;
  };
  const requireOrg = (id: string) => {
    const o = liveOrg(id);
    if (!o) throw new MissingParentError('organization');
    return o;
  };
  const requireProject = (id: string, organizationId: string) => {
    const p = projects.get(id);
    if (!p || p.deletedAt || p.organizationId !== organizationId) throw new MissingParentError('project');
  };
  const patchEntity = <T extends { id: string; updatedAt: string; deletedAt: string | null }>(
    store: Map<string, T>,
    id: string,
    patch: object,
    options: UpdateOptions,
    clashes: (row: T) => boolean,
  ): T | null => {
    const row = store.get(id);
    if (!row || row.deletedAt) return null;
    if (options.expectedUpdatedAt && Date.parse(options.expectedUpdatedAt) !== Date.parse(row.updatedAt))
      throw new StaleWriteError();
    // Slugs stay reserved by archived rows, matching the database unique constraints.
    if ([...store.values()].some((x) => x.id !== id && clashes(x))) throw new DuplicateError('slug');
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const next = new Date(Math.max(Date.parse(options.at), Date.parse(row.updatedAt) + 1)).toISOString();
    Object.assign(row, defined, { updatedAt: next });
    if ((row as { description?: string | null }).description === null)
      delete (row as { description?: string | null }).description;
    return { ...row };
  };
  const archiveRow = <T extends { deletedAt: string | null; updatedAt: string }>(row: T | undefined, at: string) => {
    if (!row || row.deletedAt) return false;
    Object.assign(row, { deletedAt: at, updatedAt: at });
    return true;
  };
  const memberRecord = (organizationId: string, userId: string): MembershipRecord | null => {
    const m = members.get(`${organizationId}:${userId}`);
    const u = users.get(userId);
    if (!m || m.status === 'removed' || !u || u.deletedAt) return null;
    return { organizationId, userId, email: u.email, name: u.name, role: m.role, status: m.status, createdAt: m.createdAt, updatedAt: m.updatedAt };
  };

  return {
    kind: 'development-memory',
    users: {
      async create(u) {
        if ([...users.values()].some((x) => x.email.toLowerCase() === u.email.toLowerCase()))
          throw new DuplicateError('email');
        users.set(u.id, { ...u });
        return { ...u };
      },
      async findById(id) {
        const u = users.get(id);
        return u && !u.deletedAt ? { ...u } : null;
      },
      async findByEmail(email) {
        const u = live(users).find((x) => x.email.toLowerCase() === email.toLowerCase());
        return u ? { ...u } : null;
      },
      async list(q) {
        return paginate(
          live(users).filter((u) => matches(q.search, u.email, u.name)),
          q,
          ['createdAt', 'updatedAt', 'email', 'name'],
        );
      },
      async activate(id, at, roles, permissions) {
        const u = users.get(id);
        if (!u || u.deletedAt || u.status === 'suspended') return null;
        if (u.status === 'pending')
          Object.assign(u, {
            status: 'active',
            emailVerifiedAt: at,
            roles,
            permissions,
            updatedAt: at,
          });
        return { ...u };
      },
      async setPasswordHash(id, passwordHash, at) {
        const u = users.get(id);
        if (u) Object.assign(u, { passwordHash, updatedAt: at });
      },
      async touchLogin(id, at) {
        const u = users.get(id);
        if (u) u.lastLoginAt = at;
      },
    },
    sessions: {
      async create(s) {
        sessions.set(s.id, { ...s });
      },
      async findByRefreshHash(hash) {
        const s = [...sessions.values()].find((x) => x.refreshTokenHash === hash);
        return s ? { ...s } : null;
      },
      async isActive(id, now) {
        const s = sessions.get(id);
        return !!s && !s.revokedAt && Date.parse(s.expiresAt) > Date.parse(now);
      },
      async rotate(hash, successor, now): Promise<RotationResult> {
        const prev = [...sessions.values()].find((s) => s.refreshTokenHash === hash);
        if (!prev) return { outcome: 'invalid' };
        if (prev.revokedAt) return { outcome: 'reuse', previous: { ...prev } };
        if (Date.parse(prev.expiresAt) <= Date.parse(now)) return { outcome: 'invalid' };
        prev.revokedAt = now; // synchronous compare-and-set: only one concurrent caller reaches here
        sessions.set(successor.id, { ...successor });
        return { outcome: 'rotated', previous: { ...prev } };
      },
      async revoke(id, now) {
        const s = sessions.get(id);
        if (s && !s.revokedAt) s.revokedAt = now;
      },
      async revokeFamily(familyId, now) {
        let n = 0;
        for (const s of sessions.values()) {
          if (s.familyId === familyId && !s.revokedAt) {
            s.revokedAt = now;
            n++;
          }
        }
        return n;
      },
      async revokeAllForUser(userId, now) {
        let n = 0;
        for (const s of sessions.values()) {
          if (s.userId === userId && !s.revokedAt) {
            s.revokedAt = now;
            n++;
          }
        }
        return n;
      },
    },
    tokens: {
      async issue(t) {
        for (const x of tokens.values())
          if (x.userId === t.userId && x.type === t.type && !x.consumedAt)
            x.consumedAt = t.createdAt;
        tokens.set(t.id, { ...t });
      },
      async consume(type, hash, now) {
        const t = [...tokens.values()].find((x) => x.type === type && x.tokenHash === hash);
        if (!t || t.consumedAt || Date.parse(t.expiresAt) <= Date.parse(now)) return null;
        t.consumedAt = now;
        return { ...t };
      },
    },
    audit: {
      async record(e) {
        audit.push({ ...e, id: randomUUID(), createdAt: new Date().toISOString() });
      },
      async list({ action, limit = 100 }) {
        return audit.filter((e) => !action || e.action === action).slice(-limit);
      },
    },
    organizations: {
      async create(o) {
        if ([...orgs.values()].some((x) => x.slug === o.slug)) throw new DuplicateError('slug');
        orgs.set(o.id, { ...o });
        return { ...o };
      },
      async findById(id, scope) {
        const o = orgs.get(id);
        return o && !o.deletedAt && visibleOrg(o, scope) ? { ...o } : null;
      },
      async list(q, scope) {
        return paginate(
          live(orgs).filter((o) => visibleOrg(o, scope) && matches(q.search, o.name)),
          q,
          ['createdAt', 'updatedAt', 'name', 'slug'],
        );
      },
      async update(id, patch, options) {
        return patchEntity(orgs, id, patch, options, (x) => x.slug === patch.slug);
      },
      async archive(id, at) {
        if (!archiveRow(orgs.get(id), at)) return false;
        for (const child of [...projects.values(), ...workspaces.values()])
          if (child.organizationId === id) archiveRow(child, at);
        return true;
      },
      async roleOf(id, userId) {
        const o = liveOrg(id);
        if (!o) return null;
        if (o.ownerUserId === userId) return 'owner';
        const m = members.get(`${id}:${userId}`);
        return m?.status === 'active' ? m.role : null;
      },
      async transferOwnership(id, newOwnerUserId, at) {
        const o = liveOrg(id);
        const next = members.get(`${id}:${newOwnerUserId}`);
        if (!o || next?.status !== 'active') return null;
        const previous = o.ownerUserId;
        Object.assign(next, { status: 'removed', updatedAt: at });
        if (previous)
          members.set(`${id}:${previous}`, { role: 'admin', status: 'active', createdAt: at, updatedAt: at });
        return patchEntity(orgs, id, { ownerUserId: newOwnerUserId }, { at }, () => false);
      },
    },
    memberships: {
      async list(organizationId, q) {
        const rows = [...members.keys()]
          .filter((k) => k.startsWith(`${organizationId}:`))
          .map((k) => memberRecord(organizationId, k.slice(organizationId.length + 1)))
          .filter((m): m is MembershipRecord => !!m && matches(q.search, m.email, m.name));
        return paginate(rows, q, ['createdAt', 'name', 'email']);
      },
      async find(organizationId, userId) {
        return memberRecord(organizationId, userId);
      },
      async add(organizationId, userId, role, at) {
        const o = requireOrg(organizationId);
        const key = `${organizationId}:${userId}`;
        const existing = members.get(key);
        if (o.ownerUserId === userId || (existing && existing.status !== 'removed'))
          throw new DuplicateError('member');
        members.set(key, { role, status: 'active', createdAt: existing?.createdAt ?? at, updatedAt: at });
        return memberRecord(organizationId, userId) as MembershipRecord;
      },
      async update(organizationId, userId, patch, at) {
        requireOrg(organizationId);
        const m = members.get(`${organizationId}:${userId}`);
        if (!m || m.status === 'removed') return null;
        Object.assign(m, { ...(patch.role ? { role: patch.role } : {}), ...(patch.status ? { status: patch.status } : {}), updatedAt: at });
        return memberRecord(organizationId, userId);
      },
      async remove(organizationId, userId, at) {
        const m = members.get(`${organizationId}:${userId}`);
        if (!m || m.status === 'removed') return false;
        Object.assign(m, { status: 'removed', updatedAt: at });
        return true;
      },
    },
    projects: {
      async create(p) {
        requireOrg(p.organizationId);
        if ([...projects.values()].some((x) => x.organizationId === p.organizationId && x.slug === p.slug))
          throw new DuplicateError('slug');
        projects.set(p.id, { ...p });
        return { ...p };
      },
      async findById(id, scope) {
        const p = projects.get(id);
        return p && !p.deletedAt && visibleOrgId(p.organizationId, scope) ? { ...p } : null;
      },
      async list(q, scope, parent) {
        return paginate(
          live(projects).filter(
            (p) => visibleOrgId(p.organizationId, scope) && matches(q.search, p.name) &&
              (!parent?.organizationId || p.organizationId === parent.organizationId),
          ),
          q,
          ['createdAt', 'updatedAt', 'name', 'slug'],
        );
      },
      async update(id, patch, options) {
        const current = projects.get(id);
        return patchEntity<ProjectRecord>(projects, id, patch, options, (x) => x.organizationId === current?.organizationId && x.slug === patch.slug);
      },
      async archive(id, at) {
        if (!archiveRow(projects.get(id), at)) return false;
        for (const w of workspaces.values()) if (w.projectId === id) archiveRow(w, at);
        return true;
      },
    },
    workspaces: {
      async create(w) {
        requireOrg(w.organizationId);
        if (w.projectId) requireProject(w.projectId, w.organizationId);
        if ([...workspaces.values()].some((x) => x.organizationId === w.organizationId && x.slug === w.slug))
          throw new DuplicateError('slug');
        workspaces.set(w.id, { ...w });
        return { ...w };
      },
      async findById(id, scope) {
        const w = workspaces.get(id);
        return w && !w.deletedAt && visibleOrgId(w.organizationId, scope) ? { ...w } : null;
      },
      async list(q, scope, parent) {
        return paginate(
          live(workspaces).filter(
            (w) => visibleOrgId(w.organizationId, scope) && matches(q.search, w.name) &&
              (!parent?.organizationId || w.organizationId === parent.organizationId) &&
              (!parent?.projectId || w.projectId === parent.projectId),
          ),
          q,
          ['createdAt', 'updatedAt', 'name', 'slug'],
        );
      },
      async update(id, patch, options) {
        const current = workspaces.get(id);
        if (!current || current.deletedAt) return null;
        if (patch.projectId) {
          requireOrg(current.organizationId);
          requireProject(patch.projectId, current.organizationId);
        }
        return patchEntity(workspaces, id, patch, options, (x) => x.organizationId === current.organizationId && x.slug === patch.slug);
      },
      async archive(id, at) {
        return archiveRow(workspaces.get(id), at);
      },
    },
    rateLimits: {
      async hit(key, max, windowMs): Promise<RateLimitDecision> {
        const t = Date.now();
        let b = buckets.get(key);
        if (!b || b.resetAt <= t) {
          b = { count: 0, resetAt: t + windowMs };
          buckets.set(key, b);
        }
        b.count += 1;
        return {
          allowed: b.count <= max,
          limit: max,
          remaining: Math.max(0, max - b.count),
          resetAt: b.resetAt,
        };
      },
      async peek(key) {
        const b = buckets.get(key);
        return b && b.resetAt > Date.now() ? { ...b } : null;
      },
      async reset(key) {
        buckets.delete(key);
      },
    },
    retention: {
      async purgeExpired(policy, now = new Date()) {
        const cutoff = now.getTime() - policy.graceMs;
        const sweep = <T>(m: Map<string, T>, expired: (v: T) => boolean): number => {
          let n = 0;
          for (const [k, v] of m)
            if (expired(v)) {
              m.delete(k);
              n += 1;
            }
          return n;
        };
        const sessionCount = sweep(sessions, (s) => Date.parse(s.expiresAt) < cutoff);
        const tokenCount = sweep(tokens, (t) => Date.parse(t.expiresAt) < cutoff);
        const bucketCount = sweep(buckets, (b) => b.resetAt < now.getTime());
        let auditCount = 0;
        if (policy.auditRetentionMs != null) {
          const auditCutoff = now.getTime() - policy.auditRetentionMs;
          for (let i = audit.length - 1; i >= 0; i -= 1) {
            if (Date.parse(audit[i]!.createdAt) < auditCutoff) {
              audit.splice(i, 1);
              auditCount += 1;
            }
          }
        }
        return {
          sessions: sessionCount,
          tokens: tokenCount,
          rateLimitBuckets: bucketCount,
          auditLogs: auditCount,
        };
      },
    },
    async ping() {},
    async close() {},
  };
};
