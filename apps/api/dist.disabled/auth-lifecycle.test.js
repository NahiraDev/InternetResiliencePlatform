import { randomUUID } from 'node:crypto';
import { hashPassword } from '@irp/auth';
import { describe, expect, it } from 'vitest';
import { buildServer } from './index.js';
import { CapturingEmailSender } from './identity/mailer.js';
import { createMemoryIdentityRepositories } from './identity/memory.js';
const PW = 'Production12345';
const make = async (mailerOverride) => {
    const mailer = new CapturingEmailSender();
    const repos = createMemoryIdentityRepositories();
    const app = await buildServer({ identity: repos, mailer: mailerOverride ?? mailer });
    return { app, mailer, repos };
};
const post = (e, url, payload, headers = {}) => e.app.inject({ method: 'POST', url, payload: payload, headers });
describe('auth lifecycle: register → verify → login → refresh → rotate → logout → revoke', () => {
    it('runs the full lifecycle and enforces each gate', async () => {
        const e = await make();
        const reg = await post(e, '/api/v1/auth/register', {
            email: 'life@example.com',
            name: 'Life',
            password: PW,
        });
        expect(reg.statusCode).toBe(201);
        expect(reg.json().data.status).toBe('pending');
        expect(reg.json().data.emailDelivery).toBe('sent');
        // pending users cannot log in even with the right password
        expect((await post(e, '/api/v1/auth/login', { email: 'life@example.com', password: PW })).statusCode).toBe(403);
        const msg = e.mailer.last('email_verification', 'life@example.com');
        expect((await post(e, '/api/v1/auth/email-verification/confirm', { token: 'x'.repeat(40) }))
            .statusCode).toBe(401);
        expect((await post(e, '/api/v1/auth/email-verification/confirm', { token: msg.token })).statusCode).toBe(200);
        // single use
        expect((await post(e, '/api/v1/auth/email-verification/confirm', { token: msg.token })).statusCode).toBe(401);
        const login = await post(e, '/api/v1/auth/login', { email: 'life@example.com', password: PW });
        expect(login.statusCode).toBe(200);
        const { accessToken, refreshToken } = login.json().data;
        expect((await e.app.inject({
            method: 'GET',
            url: '/api/v1/me',
            headers: { authorization: `Bearer ${accessToken}` },
        })).statusCode).toBe(200);
        const refreshed = await post(e, '/api/v1/auth/refresh', { refreshToken });
        expect(refreshed.statusCode).toBe(200);
        const next = refreshed.json().data;
        expect(next.refreshToken).not.toBe(refreshToken);
        const logout = await post(e, '/api/v1/auth/logout', {}, { authorization: `Bearer ${next.accessToken}` });
        expect(logout.statusCode).toBe(200);
        // access token is dead immediately, not after its 15 minute lifetime
        expect((await e.app.inject({
            method: 'GET',
            url: '/api/v1/me',
            headers: { authorization: `Bearer ${next.accessToken}` },
        })).statusCode).toBe(401);
        expect((await post(e, '/api/v1/auth/refresh', { refreshToken: next.refreshToken })).statusCode).toBe(401);
        const actions = (await e.repos.audit.list({ limit: 100 })).map((a) => a.action);
        for (const a of [
            'user.registered',
            'user.email_verified',
            'login.succeeded',
            'refresh.rotated',
            'logout',
        ])
            expect(actions).toContain(a);
        await e.app.close();
    }, 20000);
    it('detects refresh-token reuse and revokes the whole family', async () => {
        const e = await make();
        await post(e, '/api/v1/auth/register', { email: 'reuse@example.com', name: 'R', password: PW });
        await post(e, '/api/v1/auth/email-verification/confirm', {
            token: e.mailer.last('email_verification', 'reuse@example.com').token,
        });
        const first = (await post(e, '/api/v1/auth/login', { email: 'reuse@example.com', password: PW })).json().data;
        const second = (await post(e, '/api/v1/auth/refresh', { refreshToken: first.refreshToken })).json().data;
        expect((await post(e, '/api/v1/auth/refresh', { refreshToken: first.refreshToken })).statusCode).toBe(401); // replay
        expect((await post(e, '/api/v1/auth/refresh', { refreshToken: second.refreshToken })).statusCode).toBe(401); // family revoked
        expect((await e.repos.audit.list({ action: 'refresh.reuse_detected' })).length).toBeGreaterThanOrEqual(1);
        await e.app.close();
    }, 20000);
    it('lets exactly one of many concurrent refreshes win', async () => {
        const e = await make();
        await post(e, '/api/v1/auth/register', { email: 'race@example.com', name: 'R', password: PW });
        await post(e, '/api/v1/auth/email-verification/confirm', {
            token: e.mailer.last('email_verification', 'race@example.com').token,
        });
        const { refreshToken } = (await post(e, '/api/v1/auth/login', { email: 'race@example.com', password: PW })).json().data;
        const results = await Promise.all(Array.from({ length: 6 }, () => post(e, '/api/v1/auth/refresh', { refreshToken })));
        expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
        await e.app.close();
    }, 20000);
    it('resets passwords with an expiring single-use token and revokes live sessions', async () => {
        const e = await make();
        await post(e, '/api/v1/auth/register', { email: 'reset@example.com', name: 'R', password: PW });
        await post(e, '/api/v1/auth/email-verification/confirm', {
            token: e.mailer.last('email_verification', 'reset@example.com').token,
        });
        const session = (await post(e, '/api/v1/auth/login', { email: 'reset@example.com', password: PW })).json().data;
        // uniform response for unknown accounts, and no mail is sent for them
        const before = e.mailer.outbox.length;
        expect((await post(e, '/api/v1/auth/password-reset/request', { email: 'ghost@example.com' })).json()
            .data).toEqual({ accepted: true });
        expect(e.mailer.outbox.length).toBe(before);
        await post(e, '/api/v1/auth/password-reset/request', { email: 'reset@example.com' });
        const token = e.mailer.last('password_reset', 'reset@example.com').token;
        expect((await post(e, '/api/v1/auth/password-reset/confirm', { token, password: 'weak' }))
            .statusCode).toBe(400);
        expect((await post(e, '/api/v1/auth/password-reset/confirm', {
            token,
            password: 'BrandNewPass9876',
        })).statusCode).toBe(200);
        expect((await post(e, '/api/v1/auth/password-reset/confirm', {
            token,
            password: 'AnotherPass98765',
        })).statusCode).toBe(401); // replay
        expect((await e.app.inject({
            method: 'GET',
            url: '/api/v1/me',
            headers: { authorization: `Bearer ${session.accessToken}` },
        })).statusCode).toBe(401);
        expect((await post(e, '/api/v1/auth/login', { email: 'reset@example.com', password: PW }))
            .statusCode).toBe(401);
        expect((await post(e, '/api/v1/auth/login', {
            email: 'reset@example.com',
            password: 'BrandNewPass9876',
        })).statusCode).toBe(200);
        await e.app.close();
    }, 20000);
    it('rejects expired one-time tokens', async () => {
        const e = await make();
        await post(e, '/api/v1/auth/register', { email: 'old@example.com', name: 'O', password: PW });
        const token = e.mailer.last('email_verification', 'old@example.com').token;
        const { createHash } = await import('node:crypto');
        const hash = createHash('sha256').update(token).digest('hex');
        // consume with a clock in the future: the token (24h TTL) must be refused
        const later = new Date(Date.now() + 25 * 3600_000).toISOString();
        expect(await e.repos.tokens.consume('email_verification', hash, later)).toBeNull();
        await e.app.close();
    });
    it('locks an account after repeated failures and keeps the lock on correct credentials', async () => {
        const e = await make();
        await post(e, '/api/v1/auth/register', { email: 'brute@example.com', name: 'B', password: PW });
        await post(e, '/api/v1/auth/email-verification/confirm', {
            token: e.mailer.last('email_verification', 'brute@example.com').token,
        });
        const codes = [];
        for (let i = 0; i < 5; i++)
            codes.push((await post(e, '/api/v1/auth/login', {
                email: 'brute@example.com',
                password: 'WrongPassword123',
            })).statusCode);
        expect(codes.every((c) => c === 401)).toBe(true);
        // this is the per-account lock (the per-IP window of 10 is not exhausted yet)
        expect((await post(e, '/api/v1/auth/login', { email: 'brute@example.com', password: PW }))
            .statusCode).toBe(429);
        await e.app.close();
    }, 20000);
    it('grants bootstrap-admin only after the mailbox is verified', async () => {
        process.env.IRP_BOOTSTRAP_ADMIN_EMAILS = 'boss@example.com';
        const e = await make();
        const reg = await post(e, '/api/v1/auth/register', {
            email: 'boss@example.com',
            name: 'Boss',
            password: PW,
        });
        expect(reg.json().data.roles).toEqual(['member']);
        expect(reg.json().data.permissions).toEqual([]);
        const v = await post(e, '/api/v1/auth/email-verification/confirm', {
            token: e.mailer.last('email_verification', 'boss@example.com').token,
        });
        expect(v.json().data.roles).toEqual(['platform_admin']);
        await e.app.close();
        delete process.env.IRP_BOOTSTRAP_ADMIN_EMAILS;
    }, 20000);
    it('never reports success when email delivery fails', async () => {
        const failing = {
            mode: 'webhook',
            async send() {
                throw new Error('relay down');
            },
        };
        const e = await make(failing);
        const reg = await post(e, '/api/v1/auth/register', {
            email: 'nomail@example.com',
            name: 'N',
            password: PW,
        });
        expect(reg.json().data.emailDelivery).toBe('failed');
        expect((await e.repos.audit.list({ action: 'email.delivery_failed' })).length).toBe(1);
        await e.app.close();
    }, 20000);
});
describe('tenant isolation', () => {
    it('hides organizations, projects and workspaces owned by other users', async () => {
        const e = await make();
        const grant = async (email) => {
            const t = new Date().toISOString();
            await e.repos.users.create({
                id: randomUUID(),
                email,
                name: 'T',
                passwordHash: hashPassword(PW),
                status: 'active',
                roles: ['member'],
                permissions: [
                    'organizations:read',
                    'organizations:write',
                    'projects:read',
                    'projects:write',
                    'workspaces:read',
                    'workspaces:write',
                ],
                emailVerifiedAt: t,
                lastLoginAt: null,
                createdAt: t,
                updatedAt: t,
                deletedAt: null,
            });
            return (await post(e, '/api/v1/auth/login', { email, password: PW })).json().data
                .accessToken;
        };
        const a = await grant('tenant-a@example.com');
        const b = await grant('tenant-b@example.com');
        const h = (t) => ({ authorization: `Bearer ${t}` });
        const org = await e.app.inject({
            method: 'POST',
            url: '/api/v1/organizations',
            headers: h(a),
            payload: { name: 'Acme' },
        });
        expect(org.statusCode).toBe(201);
        const id = org.json().data.id;
        expect((await e.app.inject({ method: 'GET', url: `/api/v1/organizations/${id}`, headers: h(b) }))
            .statusCode).toBe(404);
        expect((await e.app.inject({ method: 'GET', url: '/api/v1/organizations', headers: h(b) })).json()
            .data).toEqual([]);
        expect((await e.app.inject({
            method: 'POST',
            url: `/api/v1/organizations/${id}/projects`,
            headers: h(b),
            payload: { name: 'P' },
        })).statusCode).toBe(404);
        expect((await e.app.inject({ method: 'DELETE', url: `/api/v1/organizations/${id}`, headers: h(b) }))
            .statusCode).toBe(404);
        expect((await e.app.inject({ method: 'GET', url: `/api/v1/organizations/${id}`, headers: h(a) }))
            .statusCode).toBe(200);
        await e.app.close();
    }, 20000);
});
//# sourceMappingURL=auth-lifecycle.test.js.map