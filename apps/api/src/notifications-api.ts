import type { FastifyInstance, FastifyRequest } from 'fastify';
import { NotFoundAppError, ForbiddenAppError, UnauthorizedAppError, ValidationAppError } from '@irp/core';
import { createPrismaClient } from '@irp/database';
import {
  NotificationIncidentCenter,
  incidentStatusSchema,
  notificationsStatusSchema,
  runtimeIncidentInputSchema,
} from './notifications.js';

const uuidSchema = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const routeId = (request: FastifyRequest): string => {
  const id = (request.params as { id?: unknown }).id;
  if (typeof id !== 'string' || !uuidSchema.test(id)) {
    throw new ValidationAppError('A valid UUID is required for the resource id.');
  }
  return id;
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
    const incident = await center.get(routeId(request));
    if (!incident) throw new NotFoundAppError('incident');
    return { success: true, data: incident };
  });

  app.post('/api/v1/incidents/:id/acknowledge', async (request) => {
    await requirePermission(request, 'runtime.admin');
    const incident = await center.acknowledge(routeId(request));
    if (!incident) throw new NotFoundAppError('incident');
    return { success: true, data: incident };
  });

  app.post('/api/v1/incidents/:id/resolve', async (request) => {
    await requirePermission(request, 'runtime.admin');
    const incident = await center.resolve(routeId(request));
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
    const notification = await center.markRead(routeId(request));
    if (!notification) throw new NotFoundAppError('notification');
    return { success: true, data: notification };
  });

  app.post('/api/v1/incidents/events', async (request) => {
    await requirePermission(request, 'runtime.admin');
    const parsed = runtimeIncidentInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationAppError('Invalid incident event payload.', { issues: parsed.error.issues });
    }
    const incident = await center.open(parsed.data);
    return { success: true, data: incident };
  });

  return center;
};
