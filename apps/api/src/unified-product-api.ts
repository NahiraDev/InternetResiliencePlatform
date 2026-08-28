import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UnauthorizedAppError } from '@irp/core';
import type { Principal } from '@irp/auth';

export const PRODUCT_API_VERSION = '1' as const;
export const PRODUCT_API_PATH = `/api/v${PRODUCT_API_VERSION}` as const;
export const PRODUCT_API_VERSION_HEADER = 'x-api-version';
export const PRODUCT_API_ACCEPT_VERSION_HEADER = 'accept-version';

export type ProductCapabilityStatus = 'implemented' | 'pending-verification' | 'planned';
export type ProductCapabilityKind = 'read' | 'mutate' | 'stream';

export interface ProductCapability {
  id: string;
  status: ProductCapabilityStatus;
  kind: ProductCapabilityKind;
  methods: readonly string[];
  paths: readonly string[];
  requiredPermissions: readonly string[];
  description: string;
}

export interface ProductApiManifest {
  api: {
    name: string;
    version: typeof PRODUCT_API_VERSION;
    pathPrefix: typeof PRODUCT_API_PATH;
    compatibility: 'backward-compatible-within-major';
  };
  clients: readonly ('web' | 'desktop' | 'ios' | 'android')[];
  capabilities: readonly ProductCapability[];
}

export interface ProductApiContext {
  apiVersion: typeof PRODUCT_API_VERSION;
  principal: {
    id: string;
    roles: readonly string[];
    scopes: readonly string[];
    organizationId?: string;
  };
  capabilities: readonly string[];
}

const versionSchema = z.string().trim().regex(/^v?1$/, 'Unsupported API version.');

const capabilities: readonly ProductCapability[] = Object.freeze([
  {
    id: 'product.capabilities.read',
    status: 'implemented',
    kind: 'read',
    methods: ['GET'],
    paths: [`${PRODUCT_API_PATH}/product/capabilities`],
    requiredPermissions: [],
    description: 'Versioned capability discovery for all supported clients.',
  },
  {
    id: 'product.context.read',
    status: 'implemented',
    kind: 'read',
    methods: ['GET'],
    paths: [`${PRODUCT_API_PATH}/product/context`],
    requiredPermissions: [],
    description: 'Authenticated client context and server-authoritative capability availability.',
  },
  {
    id: 'network.status.read',
    status: 'implemented',
    kind: 'read',
    methods: ['GET'],
    paths: [`${PRODUCT_API_PATH}/platform/status`, `${PRODUCT_API_PATH}/health/network`],
    requiredPermissions: [],
    description: 'Current network, DNS, routing, recovery and security observations.',
  },
  {
    id: 'network.metrics.read',
    status: 'implemented',
    kind: 'stream',
    methods: ['GET'],
    paths: [`${PRODUCT_API_PATH}/platform/metrics/stream`, `${PRODUCT_API_PATH}/metrics`],
    requiredPermissions: [],
    description: 'Canonical bounded telemetry and live metric observations.',
  },
  {
    id: 'runtime.autopilot',
    status: 'implemented',
    kind: 'mutate',
    methods: ['GET', 'POST'],
    paths: [
      `${PRODUCT_API_PATH}/autopilot/status`,
      `${PRODUCT_API_PATH}/autopilot/runs`,
      `${PRODUCT_API_PATH}/autopilot/runs/:id`,
      `${PRODUCT_API_PATH}/autopilot/runs/:id/cancel`,
      `${PRODUCT_API_PATH}/autopilot/actions/:id/approve`,
    ],
    requiredPermissions: ['autopilot.read', 'autopilot.execute', 'autopilot.approve', 'autopilot.admin'],
    description: 'Authoritative resilience/autopilot state and controlled execution operations.',
  },
  {
    id: 'federation.probes',
    status: 'implemented',
    kind: 'mutate',
    methods: ['GET', 'POST'],
    paths: [
      `${PRODUCT_API_PATH}/federation/probes`,
      `${PRODUCT_API_PATH}/federation/probes/:probeId/revoke`,
      `${PRODUCT_API_PATH}/federation/evidence`,
      `${PRODUCT_API_PATH}/federation/compare/:destination`,
      `${PRODUCT_API_PATH}/federation/stats`,
    ],
    requiredPermissions: ['runtime.inspect', 'runtime.admin'],
    description: 'Signed distributed probe evidence and regional comparison.',
  },
  {
    id: 'devices.remote-client',
    status: 'implemented',
    kind: 'mutate',
    methods: ['GET', 'POST'],
    paths: [
      `${PRODUCT_API_PATH}/auth/remote/devices`,
      `${PRODUCT_API_PATH}/auth/remote/devices/enroll`,
      `${PRODUCT_API_PATH}/auth/remote/token`,
      `${PRODUCT_API_PATH}/auth/remote/refresh`,
    ],
    requiredPermissions: ['runtime.admin'],
    description: 'Cross-platform remote-client enrollment and rotating session credentials.',
  },
  {
    id: 'gateway.inventory',
    status: 'pending-verification',
    kind: 'read',
    methods: ['GET'],
    paths: [`${PRODUCT_API_PATH}/gateways`, `${PRODUCT_API_PATH}/gateways/:id`],
    requiredPermissions: ['runtime.inspect'],
    description: 'Managed gateway inventory; capability contract reserved for gateway fleet API verification.',
  },
  {
    id: 'tunnel.lifecycle',
    status: 'pending-verification',
    kind: 'mutate',
    methods: ['GET', 'POST', 'DELETE'],
    paths: [`${PRODUCT_API_PATH}/tunnels`, `${PRODUCT_API_PATH}/tunnels/:id`],
    requiredPermissions: ['runtime.inspect', 'runtime.execute', 'runtime.recover'],
    description: 'Provider-neutral tunnel lifecycle contract reserved for tunnel API verification.',
  },
  {
    id: 'policies.control',
    status: 'planned',
    kind: 'mutate',
    methods: ['GET', 'PUT', 'PATCH'],
    paths: [`${PRODUCT_API_PATH}/policies`, `${PRODUCT_API_PATH}/policies/:id`],
    requiredPermissions: ['runtime.admin'],
    description: 'Server-authoritative policy configuration without client-side policy duplication.',
  },
  {
    id: 'analytics.network',
    status: 'planned',
    kind: 'read',
    methods: ['GET'],
    paths: [`${PRODUCT_API_PATH}/analytics`, `${PRODUCT_API_PATH}/analytics/network`],
    requiredPermissions: ['runtime.inspect'],
    description: 'Historical and aggregate network intelligence over retained evidence.',
  },
]);

export const PRODUCT_API_MANIFEST: ProductApiManifest = Object.freeze({
  api: {
    name: 'InternetResiliencePlatform Product API',
    version: PRODUCT_API_VERSION,
    pathPrefix: PRODUCT_API_PATH,
    compatibility: 'backward-compatible-within-major',
  },
  clients: ['web', 'desktop', 'ios', 'android'],
  capabilities,
});

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
  manifest: ProductApiManifest;
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
    for (const capability of capabilities) {
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
