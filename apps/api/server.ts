/**
 * Vercel-native Fastify entrypoint.
 *
 * Keep the standalone Node.js entrypoint at src/remote-entrypoint.ts for
 * containers and VMs. Vercel invokes the exported handler per request, so
 * initialize Fastify lazily and reuse the instance across warm invocations.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildServer } from './src/index.js';
import { registerRemoteClientRoutes } from './src/remote-client-api.js';
import { registerProbeFederationRoutes } from './src/probe-federation-api.js';
import { registerUnifiedProductRoutes } from './src/unified-product-api.js';
import { registerNotificationIncidentRoutes } from './src/notifications-api.js';
import { registerHistoryRoutes } from './src/history-api.js';

const requiredProductionEnvironment = [
  'JWT_SECRET',
  'REMOTE_CLIENT_CREDENTIAL_KEY',
  'REMOTE_CLIENT_REFRESH_KEY',
  'DATABASE_URL',
] as const;

let appPromise: ReturnType<typeof buildServer> | undefined;

const getApp = () => {
  if (!appPromise) {
    if (['production', 'staging'].includes((process.env.NODE_ENV ?? '').toLowerCase())) {
      const missing = requiredProductionEnvironment.filter((name) => !process.env[name]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `Missing required production API environment variables: ${missing.join(', ')}`,
        );
      }
    }

    appPromise = buildServer().then((app) => {
      registerUnifiedProductRoutes(app);
      registerRemoteClientRoutes(app);
      registerProbeFederationRoutes(app);
      registerNotificationIncidentRoutes(app);
      registerHistoryRoutes(app);
      return app;
    });
  }
  return appPromise;
};

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const app = await getApp();
  await app.ready();
  app.server.emit('request', request, response);
}
