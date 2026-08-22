import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_REMOTE_CLIENT_SCOPES,
  DeviceCredentialService,
  RotatingRefreshTokenStore,
  SecurityAuditLog,
  validateRemoteClientScopes,
  type RemoteClientPlatform,
  type RemoteClientScope,
  JwtService,
  RbacAuthorization,
} from '@irp/auth';
import { ForbiddenAppError, UnauthorizedAppError } from '@irp/core';

const devicePlatform = z.enum(['android', 'ios', 'linux', 'macos', 'windows', 'unknown']);
const scopesSchema = z.array(z.string()).max(DEFAULT_REMOTE_CLIENT_SCOPES.length);

const enrollmentSchema = z.object({
  deviceId: z.string().min(1).max(128).optional(),
  platform: devicePlatform,
  label: z.string().min(1).max(256).optional(),
  ttlSeconds: z.number().int().min(60).max(365 * 24 * 60 * 60).optional(),
  scopes: scopesSchema.optional(),
});

const tokenSchema = z.object({
  credentialId: z.string().uuid(),
  secret: z.string().min(16).max(512),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16).max(1024),
});

const revokeParams = z.object({ credentialId: z.string().uuid() });

const isProductionRuntime = () =>
  ['production', 'staging'].includes((process.env.NODE_ENV ?? '').toLowerCase());

const resolveKey = (name: string, fallback: string): string => {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProductionRuntime())
    throw new Error(`${name} is required for production or staging API runtime.`);
  return fallback;
};

const authorizationToken = (request: FastifyRequest): string | null => {
  const raw = request.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
};

export interface RemoteClientApiOptions {
  jwtSecret?: string;
  credentialKey?: string;
  refreshKey?: string;
  jwtIssuer?: string;
}

interface RemoteClientMetadata {
  credentialId: string;
  deviceId: string;
  platform: RemoteClientPlatform;
  label?: string;
  scopes: readonly RemoteClientScope[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface RemoteClientApiHandle {
  credentials: DeviceCredentialService;
  refreshTokens: RotatingRefreshTokenStore;
  audit: SecurityAuditLog;
}

export const registerRemoteClientRoutes = (
  app: FastifyInstance,
  options: RemoteClientApiOptions = {},
): RemoteClientApiHandle => {
  const jwtSecret =
    options.jwtSecret ?? resolveKey('JWT_SECRET', 'development-secret-development-secret-32');
  const credentialKey =
    options.credentialKey ??
    resolveKey('REMOTE_CLIENT_CREDENTIAL_KEY', `${jwtSecret}:remote-client-credential`);
  const refreshKey =
    options.refreshKey ??
    resolveKey('REMOTE_CLIENT_REFRESH_KEY', `${jwtSecret}:remote-client-refresh`);
  const jwt = new JwtService(jwtSecret, options.jwtIssuer ?? 'irp');
  const rbac = new RbacAuthorization();
  const credentials = new DeviceCredentialService(credentialKey);
  const refreshTokens = new RotatingRefreshTokenStore(refreshKey);
  const audit = new SecurityAuditLog();
  const devices = new Map<string, RemoteClientMetadata>();

  const requireAdmin = async (request: FastifyRequest): Promise<void> => {
    const token = authorizationToken(request);
    if (!token) throw new UnauthorizedAppError();
    let claims;
    try {
      claims = jwt.verify(token, 'access');
    } catch {
      throw new UnauthorizedAppError();
    }
    const allowed = await rbac.authorize({
      principal: {
        id: claims.sub,
        roles: claims.roles,
        scopes: claims.scopes,
        ...(claims.organizationId ? { organizationId: claims.organizationId } : {}),
        metadata: { sessionId: claims.sessionId, jti: claims.jti },
      },
      resource: request.url,
      action: request.method,
      requiredPermissions: ['runtime.admin'],
    });
    if (!allowed) throw new ForbiddenAppError();
  };

  const issueAccessToken = (
    subject: string,
    scopes: readonly string[],
    credentialId: string,
  ) =>
    jwt.sign({
      sub: subject,
      roles: ['remote_client'],
      scopes: [...scopes],
      sessionId: credentialId,
      type: 'access',
      ttlSeconds: 900,
    });

  app.post('/api/v1/auth/remote/devices/enroll', async (request, reply) => {
    await requireAdmin(request);
    const input = enrollmentSchema.parse(request.body ?? {});
    const scopes = validateRemoteClientScopes(input.scopes ?? [...DEFAULT_REMOTE_CLIENT_SCOPES]);
    const issued = credentials.issue({
      deviceId: input.deviceId,
      platform: input.platform,
      label: input.label,
      ttlSeconds: input.ttlSeconds,
    });
    const metadata: RemoteClientMetadata = {
      credentialId: issued.credentialId,
      deviceId: issued.deviceId,
      platform: input.platform,
      ...(input.label ? { label: input.label } : {}),
      scopes,
      createdAt: new Date().toISOString(),
      expiresAt: issued.expiresAt,
    };
    devices.set(issued.credentialId, metadata);
    audit.record({
      action: 'client.enrolled',
      success: true,
      subjectId: issued.deviceId,
      deviceId: issued.deviceId,
      credentialId: issued.credentialId,
      metadata: { platform: input.platform, scopes },
    });
    return reply.code(201).send({
      success: true,
      data: {
        credentialId: issued.credentialId,
        deviceId: issued.deviceId,
        secret: issued.secret,
        expiresAt: issued.expiresAt,
        scopes,
      },
    });
  });

  app.get('/api/v1/auth/remote/devices', async (request) => {
    await requireAdmin(request);
    return { success: true, data: [...devices.values()].map((device) => ({ ...device })) };
  });

  app.post('/api/v1/auth/remote/token', async (request) => {
    const input = tokenSchema.parse(request.body ?? {});
    const authenticated = credentials.authenticate(input.credentialId, input.secret);
    const metadata = devices.get(input.credentialId);
    if (!authenticated || !metadata || metadata.revokedAt) {
      audit.record({
        action: 'client.authenticated',
        success: false,
        credentialId: input.credentialId,
        metadata: { reason: 'invalid-credential' },
      });
      throw new UnauthorizedAppError();
    }
    const accessToken = issueAccessToken(
      authenticated.deviceId,
      metadata.scopes,
      authenticated.credentialId,
    );
    const refresh = refreshTokens.issue(authenticated.credentialId, metadata.scopes);
    audit.record({
      action: 'client.authenticated',
      success: true,
      subjectId: authenticated.deviceId,
      deviceId: authenticated.deviceId,
      credentialId: authenticated.credentialId,
      metadata: { scopes: metadata.scopes },
    });
    return {
      success: true,
      data: {
        accessToken,
        refreshToken: refresh.token,
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresAt: refresh.expiresAt,
        scopes: metadata.scopes,
        device: {
          credentialId: authenticated.credentialId,
          deviceId: authenticated.deviceId,
          platform: authenticated.platform,
          ...(authenticated.label ? { label: authenticated.label } : {}),
        },
      },
    };
  });

  app.post('/api/v1/auth/remote/refresh', async (request) => {
    const input = refreshSchema.parse(request.body ?? {});
    const rotated = refreshTokens.rotate(input.refreshToken);
    if (!rotated) {
      audit.record({
        action: 'refresh.rejected',
        success: false,
        metadata: { reason: 'invalid-or-replayed-refresh' },
      });
      throw new UnauthorizedAppError();
    }
    const metadata = devices.get(rotated.subject);
    if (!metadata || metadata.revokedAt) {
      refreshTokens.revoke(rotated.tokenId);
      audit.record({
        action: 'refresh.rejected',
        success: false,
        subjectId: rotated.subject,
        metadata: { reason: 'device-revoked' },
      });
      throw new UnauthorizedAppError();
    }
    const accessToken = issueAccessToken(metadata.deviceId, rotated.scopes, metadata.credentialId);
    audit.record({
      action: 'refresh.rotated',
      success: true,
      subjectId: metadata.deviceId,
      deviceId: metadata.deviceId,
      credentialId: metadata.credentialId,
      metadata: { scopes: rotated.scopes },
    });
    return {
      success: true,
      data: {
        accessToken,
        refreshToken: rotated.token,
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresAt: rotated.expiresAt,
        scopes: rotated.scopes,
      },
    };
  });

  app.post('/api/v1/auth/remote/logout', async (request) => {
    const input = refreshSchema.parse(request.body ?? {});
    const rotated = refreshTokens.rotate(input.refreshToken);
    if (!rotated) throw new UnauthorizedAppError();
    refreshTokens.revoke(rotated.tokenId);
    audit.record({
      action: 'refresh.rotated',
      success: true,
      subjectId: rotated.subject,
      metadata: { reason: 'logout' },
    });
    return { success: true, data: { loggedOut: true } };
  });

  app.post('/api/v1/auth/remote/devices/:credentialId/revoke', async (request) => {
    await requireAdmin(request);
    const { credentialId } = revokeParams.parse(request.params);
    const metadata = devices.get(credentialId);
    const revoked = credentials.revoke(credentialId);
    refreshTokens.revokeSubject(credentialId);
    if (metadata) {
      metadata.revokedAt = new Date().toISOString();
      devices.set(credentialId, metadata);
    }
    audit.record({
      action: 'client.revoked',
      success: revoked || Boolean(metadata?.revokedAt),
      credentialId,
      ...(metadata ? { deviceId: metadata.deviceId, subjectId: metadata.deviceId } : {}),
      metadata: { revoked },
    });
    return { success: true, data: { revoked: revoked || Boolean(metadata?.revokedAt) } };
  });

  app.get('/api/v1/auth/remote/audit', async (request) => {
    await requireAdmin(request);
    return { success: true, data: audit.list() };
  });

  return { credentials, refreshTokens, audit };
};
