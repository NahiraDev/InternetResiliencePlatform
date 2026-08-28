import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UnauthorizedAppError } from '@irp/core';
import type { Principal } from '@irp/auth';

export const PRODUCT_API_VERSION = '1' as const;
export const PRODUCT_API_PATH = `/api/v${PRODUCT_API_VERSION}` as const;
export const PRODUCT_API_VERSION_HEADER = 'x-api-version';
export const PRODUCT_API_ACCEPT_VERSION_HEADER = 'accept-version';

export type ProductApiClient = 'web' | 'desktop' | 'ios' | 'android';
export type ProductCapabilityStatus = 'implemented' | 'pending-verification' | 'planned';
export type ProductCapabilityKind = 'read' | 'mutate' | 'stream';
export type ProductCapabilityAuthentication = 'none' | 'bearer' | 'device-credential';

export interface ProductCapability {
  id: string;
  status: ProductCapabilityStatus;
  kind: ProductCapabilityKind;
  methods: readonly string[];
  paths: readonly string[];
  authentication: ProductCapabilityAuthentication;
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
  clients: readonly ProductApiClient[];
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

export const PRODUCT_API_MANIFEST = Object.freeze({
  api: {
    name: 'InternetResiliencePlatform Product API',
    version: PRODUCT_API_VERSION,
    pathPrefix: PRODUCT_API_PATH,
    compatibility: 'backward-compatible-within-major',
  },
  clients: ['web', 'desktop', 'ios', 'android'],
  capabilities: [
    {
      id: 'product.capabilities.read',
      status: 'implemented',
      kind: 'read',
      methods: ['GET'],
      paths: [`${PRODUCT_API_PATH}/product/capabilities`],
      authentication: 'none',
      requiredPermissions: [],
      description: 'Versioned capability discovery for all supported clients.',
    },
    {
      id: 'product.context.read',
      status: 'implemented',
      kind: 'read',
      methods: ['GET'],
      paths: [`${PRODUCT_API_PATH}/product/context`],
      authentication: 'bearer',
      requiredPermissions: [],
      description: 'Authenticated client context and server-authoritative capability availability.',
    },
    {
      id: 'network.status.read',
      status: 'implemented',
      kind: 'read',
      methods: ['GET'],
      paths: [`${PRODUCT_API_PATH}/platform/status`, `${PRODUCT_API_PATH}/health/network`],
      authentication: 'none',
      requiredPermissions: [],
      description: 'Current network, DNS, routing, recovery and security observations.',
    },
    {
      id: 'network.metrics.read',
      status: 'implemented',
      kind: 'stream',
      methods: ['GET'],
      paths: [`${PRODUCT_API_PATH}/platform/metrics/stream`, `${PRODUCT_API_PATH}/metrics`],
      authentication: 'none',
      requiredPermissions: [],
      description: 'Canonical bounded telemetry and live metric observations.',
    },
    {
      id: 'runtime.autopilot.read',
      status: 'implemented',
      kind: 'read',
      methods: ['GET'],
      paths: [
        `${PRODUCT_API_PATH}/autopilot/status`,
        `${PRODUCT_API_PATH}/autopilot/runs`,
        `${PRODUCT_API_PATH}/autopilot/runs/:id`,
      ],
      authentication: 'bearer',
      requiredPermissions: ['autopilot.read'],
      description: 'Authoritative resilience/autopilot state and run inspection.',
    },
    {
      id: 'runtime.autopilot.execute',
      status: 'implemented',
      kind: 'mutate',
      methods: ['POST'],
      paths: [`${PRODUCT_API_PATH}/autopilot/runs`],
      authentication: 'bearer',
      requiredPermissions: ['autopilot.execute'],
      description: 'Controlled autopilot execution through the authoritative runtime.',
    },
    {
      id: 'runtime.autopilot.approve',
      status: 'implemented',
      kind: 'mutate',
      methods: ['POST'],
      paths: [`${PRODUCT_API_PATH}/autopilot/actions/:id/approve`],
      authentication: 'bearer',
      requiredPermissions: ['autopilot.approve'],
      description: 'Explicit approval of a pending autopilot action.',
    },
    {
      id: 'runtime.autopilot.admin',
      status: 'implemented',
      kind: 'mutate',
      methods: ['POST'],
      paths: [`${PRODUCT_API_PATH}/autopilot/runs/:id/cancel`],
      authentication: 'bearer',
      requiredPermissions: ['autopilot.admin'],
      description: 'Administrative cancellation of a runtime operation.',
    },
    {
      id: 'federation.probes.read',
      status: 'implemented',
      kind: 'read',
      methods: ['GET'],
      paths: [
        `${PRODUCT_API_PATH}/federation/probes`,
        `${PRODUCT_API_PATH}/federation/evidence`,
        `${PRODUCT_API_PATH}/federation/compare/:destination`,
        `${PRODUCT_API_PATH}/federation/stats`,
      ],
      authentication: 'bearer',
      requiredPermissions: ['runtime.inspect'],
      description: 'Inspection of signed regional probe evidence.',
    },
    {
      id: 'federation.probes.admin',
      status: 'implemented',
      kind: 'mutate',
      methods: ['POST'],
      paths: [
        `${PRODUCT_API_PATH}/federation/probes`,
        `${PRODUCT_API_PATH}/federation/probes/:probeId/revoke`,
      ],
      authentication: 'bearer',
      requiredPermissions: ['runtime.admin'],
      description: 'Administrative probe registration and revocation.',
    },
    {
      id: 'federation.evidence.ingest',
      status: 'implemented',
      kind: 'mutate',
      methods: ['POST'],
      paths: [`${PRODUCT_API_PATH}/federation/evidence`],
      authentication: 'none',
      requiredPermissions: [],
      description: 'Signed probe-evidence ingestion; evidence authenticity remains server-validated.',
    },
    {
      id: 'devices.enrollment',
      status: 'implemented',
      kind: 'mutate',
      methods: ['GET', 'POST'],
      paths: [
        `${PRODUCT_API_PATH}/auth/remote/devices`,
        `${PRODUCT_API_PATH}/auth/remote/devices/enroll`,
      ],
      authentication: 'bearer',
      requiredPermissions: ['runtime.admin'],
      description: 'Cross-platform remote-client enrollment and administrative device inventory.',
    },
    {
      id: 'devices.session',
      status: 'implemented',
      kind: 'mutate',
      methods: ['POST'],
      paths: [`${PRODUCT_API_PATH}/auth/remote/token`, `${PRODUCT_API_PATH}/auth/remote/refresh`],
      authentication: 'device-credential',
      requiredPermissions: [],
      description: 'Credential exchange and rotating remote-client sessions.',
    },
    {
      id: 'gateway.inventory',
      status: 'pending-verification',
      kind: 'read',
      methods: ['GET'],
      paths: [`${PRODUCT_API_PATH}/gateways`, `${PRODUCT_API_PATH}/gateways/:id`],
      authentication: 'bearer',
      requiredPermissions: ['runtime.inspect'],
      description: 'Managed gateway inventory reserved for fleet API verification.',
    },
    {
      id: 'tunnel.lifecycle',
      status: 'pending-verification',
      kind: 'mutate',
      methods: ['GET', 'POST', 'DELETE'],
      paths: [`${PRODUCT_API_PATH}/tunnels`, `${PRODUCT_API_PATH}/tunnels/:id`],
      authentication: 'bearer',
      requiredPermissions: ['runtime.inspect'],
      description: 'Provider-neutral tunnel lifecycle contract reserved for tunnel API verification.',
    },
    {
      id: 'policies.control',
      status: 'planned',
      kind: 'mutate',
      methods: ['GET', 'PUT', 'PATCH'],
      paths: [`${PRODUCT_API_PATH}/policies`, `${PRODUCT_API_PATH}/policies/:id`],
      authentication: 'bearer',
      requiredPermissions: ['runtime.admin'],
      description: 'Server-authoritative policy configuration without client-side policy duplication.',
    },
    {
      id: 'analytics.network',
      status: 'planned',
      kind: 'read',
      methods: ['GET'],
      paths: [`${PRODUCT_API_PATH}/analytics`, `${PRODUCT_API_PATH}/analytics/network`],
      authentication: 'bearer',
      requiredPermissions: ['runtime.inspect'],
      description: 'Historical and aggregate network intelligence over retained evidence.',
    },
  ],
} as const satisfies ProductApiManifest);

const normalizeHeaderValues = (value: string | string[] | undefined): string[] => {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean);
};

const authorizationVersion = (request: FastifyRequest): string | null => {
  const explicit = normalizeHeaderValues(request.headers[PRODUCT_API_VERSION_HEADER]);
  const accepted = normalizeHeaderValues(request.headers[PRODUCT_API_ACCEPT_VERSION_HEADER]);
  const requested = explicit.length > 0 ? explicit : accepted;

  if (requested.length === 0) return null;
  if (requested.some((version) => !versionSchema.safeParse(version).success)) return requested[0] ?? null;
  if (requested.some((version) => version !== requested[0])) return requested.join(',');

  return requested[0] ?? null;
};

const isSupportedVersion = (request: FastifyRequest) => {
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
  if (capability.requiredPermissions.length === 0) {
    return capability.authentication === 'none' || capability.authentication === 'bearer';
  }
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
    if (!isSupportedVersion(request)) {
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
    const visibleCapabilities: string[] = [];
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
