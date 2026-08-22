import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ForbiddenAppError, UnauthorizedAppError } from '@irp/core';
import { ProbeFederation, type SignedProbeEvidence } from '@irp/resilience-runtime';

const registration = z.object({ probeId: z.string().regex(/^[a-zA-Z0-9._:-]{1,128}$/), name: z.string().min(1).max(256), region: z.string().min(1).max(256), publicKeyPem: z.string().min(64).max(8192) });
const evidence = z.object({
  payload: z.object({
    evidenceId: z.string().min(1).max(256), probeId: z.string().min(1).max(128), region: z.string().min(1).max(256), observedAt: z.string().datetime(), destination: z.string().min(1).max(256),
    serviceStatus: z.enum(['reachable','degraded','unreachable','unknown']),
    measurements: z.object({ latencyMs: z.number().min(0).max(300000).optional(), jitterMs: z.number().min(0).max(300000).optional(), packetLossPercent: z.number().min(0).max(100).optional(), dnsLatencyMs: z.number().min(0).max(300000).optional(), tcpLatencyMs: z.number().min(0).max(300000).optional(), tlsLatencyMs: z.number().min(0).max(300000).optional(), httpLatencyMs: z.number().min(0).max(300000).optional() }),
    metadata: z.record(z.string(), z.union([z.string().max(256), z.number().finite(), z.boolean()])).optional(),
  }),
  signature: z.string().min(16).max(1024),
});
const query = z.object({ destination: z.string().max(256).optional(), probeId: z.string().max(128).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
const destination = z.object({ destination: z.string().min(1).max(256), limit: z.coerce.number().int().min(1).max(500).default(100) });
const params = z.object({ probeId: z.string().regex(/^[a-zA-Z0-9._:-]{1,128}$/) });

const authz = async (request: FastifyRequest, permission: 'runtime.admin'|'runtime.inspect') => {
  const principal = await request.jwtAuth.authenticate({ headers: request.headers });
  if (!principal) throw new UnauthorizedAppError();
  const allowed = await request.rbac.authorize({ principal, resource: request.url, action: request.method, requiredPermissions: [permission] });
  if (!allowed) throw new ForbiddenAppError();
};

export interface ProbeFederationApiHandle { federation: ProbeFederation }

export const registerProbeFederationRoutes = (app: FastifyInstance, federation = new ProbeFederation()): ProbeFederationApiHandle => {
  app.post('/api/v1/federation/probes', async (request, reply) => {
    await authz(request, 'runtime.admin');
    const probe = federation.registerProbe(registration.parse(request.body ?? {}));
    return reply.code(201).send({ success: true, data: probe });
  });
  app.get('/api/v1/federation/probes', async (request) => { await authz(request, 'runtime.inspect'); return { success: true, data: federation.listProbes() }; });
  app.post('/api/v1/federation/probes/:probeId/revoke', async (request) => {
    await authz(request, 'runtime.admin'); const { probeId } = params.parse(request.params); return { success: true, data: { revoked: federation.revokeProbe(probeId) } };
  });
  app.post('/api/v1/federation/evidence', async (request, reply) => {
    const result = federation.ingest(evidence.parse(request.body ?? {}) as SignedProbeEvidence);
    return reply.code(result.accepted ? 202 : 400).send({ success: result.accepted, data: result });
  });
  app.get('/api/v1/federation/evidence', async (request) => { await authz(request, 'runtime.inspect'); const q=query.parse(request.query); return { success: true, data: federation.listEvidence(q) }; });
  app.get('/api/v1/federation/compare/:destination', async (request) => { await authz(request, 'runtime.inspect'); const q=destination.parse({ ...(request.params as {destination:string}), ...(request.query as object) }); return { success: true, data: federation.compareDestination(q.destination, q.limit) }; });
  app.get('/api/v1/federation/stats', async (request) => { await authz(request, 'runtime.inspect'); return { success: true, data: federation.stats() }; });
  return { federation };
};
