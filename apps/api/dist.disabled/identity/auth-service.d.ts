import { type JwtService } from '@irp/auth';
import type { EmailSender } from './mailer.js';
import { type IdentityRepositories, type UserRecord } from './types.js';
export interface AuthContext {
    ip?: string | undefined;
    userAgent?: string | undefined;
}
export interface AuthServiceOptions {
    repos: IdentityRepositories;
    mailer: EmailSender;
    jwt: JwtService;
    /** Roles/permissions granted at email verification to bootstrap-admin addresses. */
    bootstrapAdminEmails: () => string[];
    adminPermissions: string[];
    publicBaseUrl?: string | undefined;
    now?: () => Date;
    verificationTtlMs?: number;
    resetTtlMs?: number;
    refreshTtlMs?: number;
    accessTtlSeconds?: number;
    maxFailedLoginsPerAccount?: number;
    maxFailedLoginsPerIp?: number;
    lockoutWindowMs?: number;
}
export declare class AuthService {
    private readonly o;
    private readonly dummyHash;
    constructor(options: AuthServiceOptions);
    private iso;
    private audit;
    private sendToken;
    register(input: {
        email: string;
        name: string;
        password: string;
    }, ctx: AuthContext): Promise<{
        user: UserRecord;
        emailDelivery: "sent" | "failed";
    }>;
    verifyEmail(token: string, ctx: AuthContext): Promise<UserRecord>;
    /** Uniform response regardless of whether the account exists or is already verified. */
    requestEmailVerification(email: string, ctx: AuthContext): Promise<void>;
    login(email: string, password: string, ctx: AuthContext): Promise<{
        user: UserRecord;
        session: {
            expiresAt: string;
            revokedAt: null;
            createdAt: string;
            ipAddress?: string;
            userAgent?: string;
            id: `${string}-${string}-${string}-${string}-${string}`;
            userId: string;
            familyId: string;
            refreshTokenHash: string;
        };
        refreshToken: string;
        accessToken: string;
        expiresIn: number;
    }>;
    private startSession;
    private access;
    refresh(refreshToken: string, ctx: AuthContext): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }>;
    private peekSession;
    logout(sessionId: string, userId: string, ctx: AuthContext): Promise<void>;
    /** Uniform response whether or not the account exists. */
    requestPasswordReset(email: string, ctx: AuthContext): Promise<void>;
    confirmPasswordReset(token: string, newPassword: string, ctx: AuthContext): Promise<void>;
}
//# sourceMappingURL=auth-service.d.ts.map