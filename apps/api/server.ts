/**
 * Vercel-native Fastify entrypoint.
 *
 * Keep the standalone Node.js entrypoint at src/remote-entrypoint.ts for
 * containers and VMs; Vercel needs the Fastify instance exported instead of
 * a long-running listener.
 */
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

if (['production', 'staging'].includes((process.env.NODE_ENV ?? '').toLowerCase())) {
  const missing = requiredProductionEnvironment.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required production API environment variables: ${missing.join(', ')}`,
    );
  }
}

const app = await buildServer();
registerUnifiedProductRoutes(app);
registerRemoteClientRoutes(app);
registerProbeFederationRoutes(app);
registerNotificationIncidentRoutes(app);
registerHistoryRoutes(app);

// Vercel's Node backend adapter invokes this exported Fastify application.
export default app;
