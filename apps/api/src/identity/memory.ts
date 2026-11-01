import { randomUUID } from 'node:crypto';
import {
  DuplicateError,
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
  const visibleOrg = (o: OrganizationRecord, s: TenantScope) =>
    s.kind === 'all' || o.ownerUserId === s.userId;
  const visibleOrgId = (orgId: string, s: TenantScope) => {
    const o = orgs.get(orgId);
    return !!o && !o.deletedAt && visibleOrg(o, s);
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
        if (live(orgs).some((x) => x.slug === o.slug)) throw new DuplicateError('slug');
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
      async softDelete(id, scope, at) {
        const o = orgs.get(id);
        if (!o || o.deletedAt || !visibleOrg(o, scope)) return false;
        Object.assign(o, { deletedAt: at, updatedAt: at });
        return true;
      },
    },
    projects: {
      async create(p) {
        if (live(projects).some((x) => x.organizationId === p.organizationId && x.slug === p.slug))
          throw new DuplicateError('slug');
        projects.set(p.id, { ...p });
        return { ...p };
      },
      async findById(id, scope) {
        const p = projects.get(id);
        return p && !p.deletedAt && visibleOrgId(p.organizationId, scope) ? { ...p } : null;
      },
      async list(q, scope) {
        return paginate(
          live(projects).filter(
            (p) => visibleOrgId(p.organizationId, scope) && matches(q.search, p.name),
          ),
          q,
          ['createdAt', 'updatedAt', 'name', 'slug'],
        );
      },
    },
    workspaces: {
      async create(w) {
        if (
          live(workspaces).some((x) => x.organizationId === w.organizationId && x.slug === w.slug)
        )
          throw new DuplicateError('slug');
        workspaces.set(w.id, { ...w });
        return { ...w };
      },
      async findById(id, scope) {
        const w = workspaces.get(id);
        return w && !w.deletedAt && visibleOrgId(w.organizationId, scope) ? { ...w } : null;
      },
      async list(q, scope) {
        return paginate(
          live(workspaces).filter(
            (w) => visibleOrgId(w.organizationId, scope) && matches(q.search, w.name),
          ),
          q,
          ['createdAt', 'updatedAt', 'name', 'slug'],
        );
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
    async ping() {},
    async close() {},
  };
};
