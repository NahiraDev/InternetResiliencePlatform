import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_REMOTE_CLIENT_SCOPES,
  validateRemoteClientScopes,
  JwtService,
  RbacAuthorization,
} from '@irp/auth';
import { ForbiddenAppError, NotFoundAppError, UnauthorizedAppError } from '@irp/core';
import { requireDurableOrDevelopment } from './durability.js';
import {
  createMemoryRemoteClientStore,
  type RemoteClientKeys,
  type RemoteClientStore,
} from './remote-client-store.js';

const devicePlatform = z.enum(['android', 'ios', 'linux', 'macos', 'windows', 'unknown']);
const scopesSchema = z.array(z.string()).max(DEFAULT_REMOTE_CLIENT_SCOPES.length);

const enrollmentSchema = z.object({
  deviceId: z.string().min(1).max(128).optional(),
  platform: devicePlatform,
  label: z.string().min(1).max(256).optional(),
  ttlSeconds: z
    .number()
    .int()
    .min(60)
    .max(365 * 24 * 60 * 60)
    .optional(),
  scopes: scopesSchema.optional(),
});

const enrollmentRequestSchema = z.object({
  platform: devicePlatform,
  label: z.string().min(1).max(256).optional(),
});

const requestIdParams = z.object({ requestId: z.string().uuid() });

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
  /**
   * Durable store for device credentials, refresh tokens, enrollment requests and audit events.
   * Production/staging require it (PostgreSQL); without one the routes fall back to an in-memory
   * development store outside production and refuse to register inside it.
   */
  store?: RemoteClientStore;
}

/** Resolves the signing secret and the two HMAC keys exactly as the routes do (single source of truth). */
export const resolveRemoteClientKeys = (
  options: Pick<RemoteClientApiOptions, 'jwtSecret' | 'credentialKey' | 'refreshKey'> = {},
): RemoteClientKeys & { jwtSecret: string } => {
  const jwtSecret =
    options.jwtSecret ?? resolveKey('JWT_SECRET', 'development-secret-development-secret-32');
  return {
    jwtSecret,
    credentialKey:
      options.credentialKey ??
      resolveKey('REMOTE_CLIENT_CREDENTIAL_KEY', `${jwtSecret}:remote-client-credential`),
    refreshKey:
      options.refreshKey ??
      resolveKey('REMOTE_CLIENT_REFRESH_KEY', `${jwtSecret}:remote-client-refresh`),
  };
};

export interface RemoteClientApiHandle {
  store: RemoteClientStore;
}

export const registerRemoteClientRoutes = (
  app: FastifyInstance,
  options: RemoteClientApiOptions = {},
): RemoteClientApiHandle => {
  const keys = resolveRemoteClientKeys(options);
  const jwt = new JwtService(keys.jwtSecret, options.jwtIssuer ?? 'irp');
  const rbac = new RbacAuthorization();
  let store = options.store;
  if (!store) {
    requireDurableOrDevelopment('remote-client credentials, refresh tokens and enrollment requests', false);
    store = createMemoryRemoteClientStore(keys);
  }
  const clients = store;

  const verifyAccess = (request: FastifyRequest) => {
    const token = authorizationToken(request);
    if (!token) throw new UnauthorizedAppError();
    try {
      return jwt.verify(token, 'access');
    } catch {
      throw new UnauthorizedAppError();
    }
  };

  /** Returns the admin's subject so decisions can be attributed. */
  const requireAdmin = async (request: FastifyRequest): Promise<string> => {
    const claims = verifyAccess(request);
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
    return claims.sub;
  };

  const requireUser = async (
    request: FastifyRequest,
  ): Promise<{ id: string; roles: string[]; scopes: string[] }> => {
    const claims = verifyAccess(request);
    if (claims.roles.includes('remote_client'))
      throw new ForbiddenAppError('remote clients cannot request enrollment');
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
      requiredPermissions: [],
    });
    if (!allowed) throw new ForbiddenAppError();
    return { id: claims.sub, roles: claims.roles, scopes: claims.scopes };
  };

  const issueAccessToken = (subject: string, scopes: readonly string[], credentialId: string) =>
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
    const { issued } = await clients.issueCredential({
      platform: input.platform,
      ...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
      scopes,
    });
    await clients.recordAudit({
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

  // ── User-initiated device enrollment request flow ────────────────────────
  // An authenticated user requests to enroll a device. An admin must approve
  // the request before device credentials are issued. Requests, decisions and
  // issued credentials are durable (shared across instances and restarts); the
  // secret is returned once at approval time and never stored.

  app.post('/api/v1/auth/remote/devices/request', async (request, reply) => {
    const user = await requireUser(request);
    const input = enrollmentRequestSchema.parse(request.body ?? {});
    const record = await clients.createEnrollmentRequest({
      userId: user.id,
      platform: input.platform,
      ...(input.label ? { label: input.label } : {}),
    });
    await clients.recordAudit({
      action: 'client.enrolled',
      success: true,
      subjectId: user.id,
      metadata: { platform: input.platform, label: input.label, requestId: record.id },
    });
    return reply.code(201).send({ success: true, data: { requestId: record.id, status: 'pending' } });
  });

  app.get('/api/v1/auth/remote/devices/requests', async (request) => {
    await requireAdmin(request);
    const pending = (await clients.listPendingEnrollmentRequests()).map(
      ({ id, userId, platform, label, createdAt }) => ({ id, userId, platform, label, createdAt }),
    );
    return { success: true, data: pending };
  });

  app.post<{ Params: { requestId: string } }>(
    '/api/v1/auth/remote/devices/requests/:requestId/approve',
    async (request, reply) => {
      const adminId = await requireAdmin(request);
      const { requestId } = requestIdParams.parse(request.params);
      const approved = await clients.approveEnrollmentRequest(requestId, adminId, [
        ...DEFAULT_REMOTE_CLIENT_SCOPES,
      ]);
      if (!approved) throw new NotFoundAppError('enrollment request not found or already decided');
      const { request: record, issued, device } = approved;
      await clients.recordAudit({
        action: 'client.enrolled',
        success: true,
        subjectId: record.userId,
        deviceId: issued.deviceId,
        credentialId: issued.credentialId,
        metadata: { platform: record.platform, requestId, approved: true },
      });
      return reply.code(200).send({
        success: true,
        data: {
          requestId,
          status: 'approved',
          credentialId: issued.credentialId,
          deviceId: issued.deviceId,
          secret: issued.secret,
          expiresAt: issued.expiresAt,
          scopes: device.scopes,
        },
      });
    },
  );

  app.post<{ Params: { requestId: string } }>(
    '/api/v1/auth/remote/devices/requests/:requestId/reject',
    async (request, reply) => {
      const adminId = await requireAdmin(request);
      const { requestId } = requestIdParams.parse(request.params);
      const record = await clients.rejectEnrollmentRequest(requestId, adminId);
      if (!record) throw new NotFoundAppError('enrollment request not found or already decided');
      await clients.recordAudit({
        action: 'client.enrolled',
        success: false,
        subjectId: record.userId,
        metadata: { platform: record.platform, requestId, approved: false },
      });
      return reply.code(200).send({ success: true, data: { requestId, status: 'rejected' } });
    },
  );

  app.get('/api/v1/auth/remote/devices', async (request) => {
    await requireAdmin(request);
    return { success: true, data: await clients.listDevices() };
  });

  app.post('/api/v1/auth/remote/token', async (request) => {
    const input = tokenSchema.parse(request.body ?? {});
    const result = await clients.authenticateCredential(input.credentialId, input.secret);
    if (!result) {
      await clients.recordAudit({
        action: 'client.authenticated',
        success: false,
        credentialId: input.credentialId,
        metadata: { reason: 'invalid-credential' },
      });
      throw new UnauthorizedAppError();
    }
    const { auth: authenticated, device } = result;
    const accessToken = issueAccessToken(authenticated.deviceId, device.scopes, authenticated.credentialId);
    const refresh = await clients.issueRefreshToken(authenticated.credentialId, device.scopes);
    await clients.recordAudit({
      action: 'client.authenticated',
      success: true,
      subjectId: authenticated.deviceId,
      deviceId: authenticated.deviceId,
      credentialId: authenticated.credentialId,
      metadata: { scopes: device.scopes },
    });
    return {
      success: true,
      data: {
        accessToken,
        refreshToken: refresh.token,
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresAt: refresh.expiresAt,
        scopes: device.scopes,
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
    const rotated = await clients.rotateRefreshToken(input.refreshToken);
    if (!rotated) {
      await clients.recordAudit({
        action: 'refresh.rejected',
        success: false,
        metadata: { reason: 'invalid-or-replayed-refresh' },
      });
      throw new UnauthorizedAppError();
    }
    const device = await clients.getDevice(rotated.subject);
    if (!device || device.revokedAt) {
      await clients.revokeRefreshToken(rotated.tokenId);
      await clients.recordAudit({
        action: 'refresh.rejected',
        success: false,
        subjectId: rotated.subject,
        metadata: { reason: 'device-revoked' },
      });
      throw new UnauthorizedAppError();
    }
    const accessToken = issueAccessToken(device.deviceId, rotated.scopes, device.credentialId);
    await clients.recordAudit({
      action: 'refresh.rotated',
      success: true,
      subjectId: device.deviceId,
      deviceId: device.deviceId,
      credentialId: device.credentialId,
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
    const rotated = await clients.rotateRefreshToken(input.refreshToken);
    if (!rotated) throw new UnauthorizedAppError();
    await clients.revokeRefreshToken(rotated.tokenId);
    await clients.recordAudit({
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
    const { revoked, device } = await clients.revokeCredential(credentialId);
    await clients.recordAudit({
      action: 'client.revoked',
      success: revoked,
      credentialId,
      ...(device ? { deviceId: device.deviceId, subjectId: device.deviceId } : {}),
      metadata: { revoked },
    });
    return { success: true, data: { revoked } };
  });

  app.get('/api/v1/auth/remote/audit', async (request) => {
    await requireAdmin(request);
    return { success: true, data: await clients.listAudit() };
  });

  return { store: clients };
};
