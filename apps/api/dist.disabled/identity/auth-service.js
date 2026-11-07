import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '@irp/auth';
import { AppError, ConflictAppError, ForbiddenAppError, UnauthorizedAppError } from '@irp/core';
import { DuplicateError } from './types.js';
const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const newSecret = () => randomBytes(32).toString('base64url');
const tooMany = (resetAt) => new AppError('RATE_LIMITED', 'Too many attempts. Retry later.', 429, {
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
});
export class AuthService {
    o;
    // Verified once so unknown-account logins cost the same as known-account ones.
    dummyHash = hashPassword(randomBytes(12).toString('hex'));
    constructor(options) {
        this.o = {
            now: () => new Date(),
            verificationTtlMs: 24 * 3600_000,
            resetTtlMs: 30 * 60_000,
            refreshTtlMs: 30 * 86_400_000,
            accessTtlSeconds: 900,
            maxFailedLoginsPerAccount: 5,
            maxFailedLoginsPerIp: 30,
            lockoutWindowMs: 15 * 60_000,
            ...options,
        };
    }
    iso() {
        return this.o.now().toISOString();
    }
    audit(action, ctx, actorUserId, metadata = {}) {
        // Audit persistence must not be silently dropped: a failure here fails the request.
        return this.o.repos.audit.record({
            actorUserId,
            action,
            resource: 'auth',
            resourceId: actorUserId,
            metadata,
            ipAddress: ctx.ip ?? null,
        });
    }
    async sendToken(user, kind) {
        const secret = newSecret();
        const ttl = kind === 'email_verification' ? this.o.verificationTtlMs : this.o.resetTtlMs;
        const created = this.iso();
        await this.o.repos.tokens.issue({
            id: randomUUID(),
            userId: user.id,
            type: kind,
            tokenHash: sha256(secret),
            expiresAt: new Date(this.o.now().getTime() + ttl).toISOString(),
            consumedAt: null,
            createdAt: created,
        });
        const path = kind === 'email_verification' ? 'verify-email' : 'reset-password';
        const link = this.o.publicBaseUrl
            ? `\n\n${this.o.publicBaseUrl.replace(/\/$/, '')}/${path}?token=${encodeURIComponent(secret)}`
            : '';
        try {
            await this.o.mailer.send({
                to: user.email,
                kind,
                token: secret,
                subject: kind === 'email_verification'
                    ? 'Verify your IRP email address'
                    : 'Reset your IRP password',
                text: `Your one-time ${kind === 'email_verification' ? 'verification' : 'password reset'} token: ${secret}${link}\n\nIt expires in ${Math.round(ttl / 60_000)} minutes and can be used once. If you did not request this, ignore this message.`,
            });
            return 'sent';
        }
        catch {
            return 'failed';
        }
    }
    async register(input, ctx) {
        const t = this.iso();
        let user;
        try {
            // Everyone starts `pending` with no privileges; roles (including bootstrap admin) are granted only
            // after the mailbox owner proves control of the address, so squatting an admin email gains nothing.
            user = await this.o.repos.users.create({
                id: randomUUID(),
                email: input.email,
                name: input.name,
                passwordHash: hashPassword(input.password),
                status: 'pending',
                roles: ['member'],
                permissions: [],
                emailVerifiedAt: null,
                lastLoginAt: null,
                createdAt: t,
                updatedAt: t,
                deletedAt: null,
            });
        }
        catch (e) {
            if (e instanceof DuplicateError)
                throw new ConflictAppError('Email is already registered.');
            throw e;
        }
        await this.audit('user.registered', ctx, user.id);
        const emailDelivery = await this.sendToken(user, 'email_verification');
        if (emailDelivery === 'failed')
            await this.audit('email.delivery_failed', ctx, user.id, { kind: 'email_verification' });
        return { user, emailDelivery };
    }
    async verifyEmail(token, ctx) {
        const rec = await this.o.repos.tokens.consume('email_verification', sha256(token), this.iso());
        if (!rec)
            throw new UnauthorizedAppError('Invalid or expired token');
        const user = await this.o.repos.users.findById(rec.userId);
        if (!user)
            throw new UnauthorizedAppError('Invalid or expired token');
        const admin = this.o.bootstrapAdminEmails().includes(user.email.toLowerCase());
        const activated = await this.o.repos.users.activate(user.id, this.iso(), admin ? ['platform_admin'] : ['member'], admin ? this.o.adminPermissions : []);
        if (!activated)
            throw new ForbiddenAppError('Account cannot be activated');
        await this.audit('user.email_verified', ctx, user.id, { bootstrapAdmin: admin });
        return activated;
    }
    /** Uniform response regardless of whether the account exists or is already verified. */
    async requestEmailVerification(email, ctx) {
        const user = await this.o.repos.users.findByEmail(email);
        if (user && user.status === 'pending') {
            const result = await this.sendToken(user, 'email_verification');
            await this.audit(result === 'sent' ? 'email_verification.requested' : 'email.delivery_failed', ctx, user.id);
        }
    }
    async login(email, password, ctx) {
        const acctKey = `login:acct:${sha256(email.toLowerCase())}`;
        const ipKey = `login:ip:${ctx.ip ?? 'unknown'}`;
        const rl = this.o.repos.rateLimits;
        const [acct, ip] = await Promise.all([rl.peek(acctKey), rl.peek(ipKey)]);
        if (acct && acct.count >= this.o.maxFailedLoginsPerAccount) {
            await this.audit('login.locked', ctx, null, { scope: 'account' });
            throw tooMany(acct.resetAt);
        }
        if (ip && ip.count >= this.o.maxFailedLoginsPerIp)
            throw tooMany(ip.resetAt);
        const user = await this.o.repos.users.findByEmail(email);
        const valid = verifyPassword(password, user?.passwordHash ?? this.dummyHash) && !!user;
        if (!valid || !user) {
            await Promise.all([
                rl.hit(acctKey, this.o.maxFailedLoginsPerAccount, this.o.lockoutWindowMs),
                rl.hit(ipKey, this.o.maxFailedLoginsPerIp, this.o.lockoutWindowMs),
            ]);
            await this.audit('login.failed', ctx, user?.id ?? null);
            throw new UnauthorizedAppError('Invalid credentials');
        }
        if (user.status === 'pending')
            throw new ForbiddenAppError('Email verification required');
        if (user.status !== 'active')
            throw new UnauthorizedAppError('Invalid credentials');
        await rl.reset(acctKey);
        await this.o.repos.users.touchLogin(user.id, this.iso());
        const tokens = await this.startSession(user, randomUUID(), ctx);
        await this.audit('login.succeeded', ctx, user.id);
        return { ...tokens, user };
    }
    async startSession(user, familyId, ctx) {
        const refreshToken = newSecret();
        const id = randomUUID();
        const t = this.o.now();
        const session = {
            id,
            userId: user.id,
            familyId,
            refreshTokenHash: sha256(refreshToken),
            ...(ctx.userAgent ? { userAgent: ctx.userAgent.slice(0, 256) } : {}),
            ...(ctx.ip ? { ipAddress: ctx.ip } : {}),
            expiresAt: new Date(t.getTime() + this.o.refreshTtlMs).toISOString(),
            revokedAt: null,
            createdAt: t.toISOString(),
        };
        await this.o.repos.sessions.create(session);
        return {
            session,
            refreshToken,
            accessToken: this.access(user, id),
            expiresIn: this.o.accessTtlSeconds,
        };
    }
    access(user, sessionId) {
        return this.o.jwt.sign({
            sub: user.id,
            roles: user.roles,
            scopes: user.permissions,
            sessionId,
            type: 'access',
            ttlSeconds: this.o.accessTtlSeconds,
        });
    }
    async refresh(refreshToken, ctx) {
        const hash = sha256(refreshToken);
        const t = this.iso();
        const successorToken = newSecret();
        const successor = {
            id: randomUUID(),
            userId: '',
            familyId: '',
            refreshTokenHash: sha256(successorToken),
            expiresAt: new Date(this.o.now().getTime() + this.o.refreshTtlMs).toISOString(),
            revokedAt: null,
            createdAt: t,
            ...(ctx.userAgent ? { userAgent: ctx.userAgent.slice(0, 256) } : {}),
            ...(ctx.ip ? { ipAddress: ctx.ip } : {}),
        };
        // The successor inherits owner and family from the presented token's session.
        const prev = await this.peekSession(hash);
        if (!prev)
            throw new UnauthorizedAppError();
        successor.userId = prev.userId;
        successor.familyId = prev.familyId;
        const r = await this.o.repos.sessions.rotate(hash, successor, t);
        if (r.outcome === 'reuse') {
            // A rotated token was presented again: treat the whole lineage as stolen.
            await this.o.repos.sessions.revokeFamily(r.previous.familyId, t);
            await this.audit('refresh.reuse_detected', ctx, r.previous.userId, {
                familyId: r.previous.familyId,
            });
            throw new UnauthorizedAppError();
        }
        if (r.outcome === 'invalid')
            throw new UnauthorizedAppError();
        const user = await this.o.repos.users.findById(r.previous.userId);
        if (!user || user.status !== 'active') {
            await this.o.repos.sessions.revokeFamily(r.previous.familyId, t);
            throw new UnauthorizedAppError();
        }
        await this.audit('refresh.rotated', ctx, user.id);
        return {
            accessToken: this.access(user, successor.id),
            refreshToken: successorToken,
            expiresIn: this.o.accessTtlSeconds,
        };
    }
    async peekSession(hash) {
        return this.o.repos.sessions.findByRefreshHash(hash);
    }
    async logout(sessionId, userId, ctx) {
        await this.o.repos.sessions.revoke(sessionId, this.iso());
        await this.audit('logout', ctx, userId);
    }
    /** Uniform response whether or not the account exists. */
    async requestPasswordReset(email, ctx) {
        const user = await this.o.repos.users.findByEmail(email);
        if (user && user.status === 'active') {
            const result = await this.sendToken(user, 'password_reset');
            await this.audit(result === 'sent' ? 'password_reset.requested' : 'email.delivery_failed', ctx, user.id);
        }
    }
    async confirmPasswordReset(token, newPassword, ctx) {
        const rec = await this.o.repos.tokens.consume('password_reset', sha256(token), this.iso());
        if (!rec)
            throw new UnauthorizedAppError('Invalid or expired token');
        const t = this.iso();
        await this.o.repos.users.setPasswordHash(rec.userId, hashPassword(newPassword), t);
        // A reset ends every existing session, including any held by an attacker.
        await this.o.repos.sessions.revokeAllForUser(rec.userId, t);
        await this.o.repos.rateLimits.reset(`login:acct:${sha256((await this.o.repos.users.findById(rec.userId))?.email.toLowerCase() ?? '')}`);
        await this.audit('password_reset.completed', ctx, rec.userId);
    }
}
//# sourceMappingURL=auth-service.js.map