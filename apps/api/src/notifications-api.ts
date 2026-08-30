import type { FastifyInstance, FastifyRequest } from 'fastify';
import { NotFoundAppError, ForbiddenAppError, UnauthorizedAppError } from '@irp/core';
import { createPrismaClient } from '@irp/database';
import {
  NotificationIncidentCenter,
  incidentStatusSchema,
  notificationsStatusSchema,
} from './notifications.js';

const authenticate = async (request: FastifyRequest) => {
  const principal = await request.jwtAuth.authenticate({ headers: request.headers });
  if (!principal) throw new UnauthorizedAppError();
  return principal;
};

const requirePermission = async (request: FastifyRequest, permission: string) => {
  const principal = await authenticate(request);
  const allowed = await request.rbac.authorize({
    principal,
    resource: request.routeOptions.url ?? request.url,
    action: request.method,
    requiredPermissions: [permission],
  });
  if (!allowed) throw new ForbiddenAppError();
};

export const registerNotificationIncidentRoutes = (app: FastifyInstance) => {
  const db = createPrismaClient(process.env.DATABASE_URL);
  const center = new NotificationIncidentCenter(db);

  app.addHook('onClose', async () => {
    await db.$disconnect();
  });

  app.get('/api/v1/incidents', async (request) => {
    await requirePermission(request, 'runtime.read');
    const query = notificationsStatusSchema.parse(request.query);
    return {
      success: true,
      data: await center.listIncidents(query.limit, query.status),
    };
  });

  app.get('/api/v1/incidents/:id', async (request) => {
    await requirePermission(request, 'runtime.read');
    const id = String((request.params as { id: string }).id);
    const incident = await center.get(id);
    if (!incident) throw new NotFoundAppError('incident');
    return { success: true, data: incident };
  });

  app.post('/api/v1/incidents/:id/acknowledge', async (request) => {
    await requirePermission(request, 'runtime.admin');
    const id = String((request.params as { id: string }).id);
    const incident = await center.acknowledge(id);
    if (!incident) throw new NotFoundAppError('incident');
    return { success: true, data: incident };
  });

  app.post('/api/v1/incidents/:id/resolve', async (request) => {
    await requirePermission(request, 'runtime.admin');
    const id = String((request.params as { id: string }).id);
    const incident = await center.resolve(id);
    if (!incident) throw new NotFoundAppError('incident');
    return { success: true, data: incident };
  });

  app.get('/api/v1/notifications', async (request) => {
    await requirePermission(request, 'runtime.read');
    const query = notificationsStatusSchema.parse(request.query);
    return {
      success: true,
      data: await center.listNotifications(query.limit, query.unreadOnly),
    };
  });

  app.post('/api/v1/notifications/:id/read', async (request) => {
    await requirePermission(request, 'runtime.read');
    const id = String((request.params as { id: string }).id);
    const notification = await center.markRead(id);
    if (!notification) throw new NotFoundAppError('notification');
    return { success: true, data: notification };
  });

  app.post('/api/v1/incidents/events', async (request) => {
    await requirePermission(request, 'runtime.admin');
    const input = request.body as Record<string, unknown>;
    const classification = String(input.classification ?? 'transient_anomaly');
    const rootCause = String(input.rootCause ?? 'Unclassified network degradation');
    const confidence = Number(input.confidence ?? 0);
    const affectedComponents = Array.isArray(input.affectedComponents)
      ? input.affectedComponents.map(String)
      : [];
    const evidence = Array.isArray(input.evidence) ? input.evidence.map(String) : [];
    if (!incidentStatusSchema.safeParse(input.status).success && input.status !== undefined) {
      throw new ForbiddenAppError('Invalid incident status for ingestion.');
    }
    const incident = await center.open({
      ...(typeof input.source === 'string' ? { source: input.source } : {}),
      classification,
      rootCause,
      affectedComponents,
      evidence,
      correlationReason: String(input.correlationReason ?? 'No correlation reason provided.'),
      confidence: Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0)),
    });
    return { success: true, data: incident };
  });

  return center;
};
