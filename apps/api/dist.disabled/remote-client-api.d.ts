import type { FastifyInstance } from 'fastify';
import { DeviceCredentialService, RotatingRefreshTokenStore, SecurityAuditLog } from '@irp/auth';
export interface RemoteClientApiOptions {
    jwtSecret?: string;
    credentialKey?: string;
    refreshKey?: string;
    jwtIssuer?: string;
}
export interface RemoteClientApiHandle {
    credentials: DeviceCredentialService;
    refreshTokens: RotatingRefreshTokenStore;
    audit: SecurityAuditLog;
}
export declare const registerRemoteClientRoutes: (app: FastifyInstance, options?: RemoteClientApiOptions) => RemoteClientApiHandle;
//# sourceMappingURL=remote-client-api.d.ts.map