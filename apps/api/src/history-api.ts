import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ForbiddenAppError, UnauthorizedAppError } from '@irp/core';
import {
  InMemoryHistoricalMeasurementStore,
  createHistoricalReport,
  exportHistoricalReportCsv,
  type HistoricalMeasurementStore,
} from '@irp/historical-analysis';

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().datetime()),
  to: z.string().datetime({ offset: true }).or(z.string().datetime()),
  probeTypes: z.union([z.string(), z.array(z.string())]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  format: z.enum(['json', 'csv']).optional(),
});

const authz = async (request: FastifyRequest, permission: 'runtime.admin' | 'runtime.inspect') => {
  const principal = await request.jwtAuth.authenticate({ headers: request.headers });
  if (!principal) throw new UnauthorizedAppError();
  const allowed = await request.rbac.authorize({
    principal,
    resource: request.url,
    action: request.method,
    requiredPermissions: [permission],
  });
  if (!allowed) throw new ForbiddenAppError();
};

export interface HistoryApiHandle {
  store: HistoricalMeasurementStore;
}

export const registerHistoryRoutes = (
  app: FastifyInstance,
  store = new InMemoryHistoricalMeasurementStore(),
): HistoryApiHandle => {
  app.get('/api/v1/history/report', async (request, reply) => {
    await authz(request, 'runtime.inspect');
    const query = querySchema.parse(request.query);
    const probeTypes = query.probeTypes
      ? Array.isArray(query.probeTypes)
        ? query.probeTypes
        : [query.probeTypes]
      : undefined;
    const report = await createHistoricalReport(store, {
      from: query.from,
      to: query.to,
      ...(probeTypes === undefined ? {} : { probeTypes }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });
    if (query.format === 'csv') {
      return reply.header('content-type', 'text/csv').send(exportHistoricalReportCsv(report));
    }
    return { success: true, data: report };
  });
  return { store };
};
