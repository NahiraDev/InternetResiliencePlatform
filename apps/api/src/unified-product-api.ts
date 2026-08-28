import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UnauthorizedAppError } from '@irp/core';
import type { Principal } from '@irp/auth';
import {
  PRODUCT_API_MANIFEST,
  PRODUCT_API_PATH,
  PRODUCT_API_VERSION,
  type ProductApiContext,
  type ProductCapability,
} from '@irp/shared';

export const PRODUCT_API_VERSION_HEADER = 'x-api-version';
export const PRODUCT_API_ACCEPT_VERSION_HEADER = 'accept-version';

const versionSchema = z.string().trim().regex(/^v?1$/, 'Unsupported API version.');

const authorizationVersion = (request: FastifyRequest): string | null => {
  const version = request.headers[PRODUCT_API_VERSION_HEADER];
  const accepted = request.headers[PRODUCT_API_ACCEPT_VERSION_HEADER];
  const value = Array.isArray(version) ? version[0] : version ?? accepted;
  return value?.trim() ?? null;
};

const requireSupportedVersion = (request: FastifyRequest) => {
  const requested = authorizationVersion(request);
  return requested === null || versionSchema.safeParse(requested).success;
};

const authenticate = async (request: FastifyRequest) => {
  const principal = await request.jwtAuth.authenticate({ headers: request.headers });
  if (!principal) throw new UnauthorizedAppError();
  return principal;
};

const hasCapability = async (
  request: FastifyRequest,
  principal: Principal,
  capability: ProductCapability,
): Promise<boolean> => {
  if (capability.status !== 'implemented') return false;
  if (capability.requiredPermissions.length === 0) return true;
  for (const permission of capability.requiredPermissions) {
    if (
      await request.rbac.authorize({
        principal,
        resource: capability.paths[0] ?? `${PRODUCT_API_PATH}/product/context`,
        action: capability.kind === 'mutate' ? 'POST' : 'GET',
        requiredPermissions: [permission],
      })
    ) {
      return true;
    }
  }
  return false;
};

export interface UnifiedProductApiHandle {
  manifest: typeof PRODUCT_API_MANIFEST;
}

export const registerUnifiedProductRoutes = (app: FastifyInstance): UnifiedProductApiHandle => {
  app.addHook('onRequest', async (request, reply) => {
    if (!requireSupportedVersion(request)) {
      return reply.code(406).send({
        success: false,
        error: {
          code: 'API_VERSION_NOT_SUPPORTED',
          message: 'The requested API version is not supported.',
          supportedVersions: [`v${PRODUCT_API_VERSION}`],
        },
      });
    }
    reply.header(PRODUCT_API_VERSION_HEADER, PRODUCT_API_VERSION);
    reply.header('x-api-supported-versions', `v${PRODUCT_API_VERSION}`);
  });

  app.get(`${PRODUCT_API_PATH}/product/capabilities`, async () => ({
    success: true,
    data: PRODUCT_API_MANIFEST,
  }));

  app.get(`${PRODUCT_API_PATH}/product/context`, async (request) => {
    const principal = await authenticate(request);
    const visibleCapabilities = [] as string[];
    for (const capability of PRODUCT_API_MANIFEST.capabilities) {
      if (await hasCapability(request, principal, capability)) visibleCapabilities.push(capability.id);
    }

    return {
      success: true,
      data: {
        apiVersion: PRODUCT_API_VERSION,
        principal: {
          id: principal.id,
          roles: principal.roles,
          scopes: principal.scopes,
          ...(principal.organizationId ? { organizationId: principal.organizationId } : {}),
        },
        capabilities: visibleCapabilities,
      } satisfies ProductApiContext,
    };
  });

  return { manifest: PRODUCT_API_MANIFEST };
};
