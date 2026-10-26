/**
 * Vercel-native Fastify entrypoint.
 *
 * Vercel's Fastify adapter discovers the Fastify instance through listen().
 * Keep the standalone Node.js entrypoint at src/remote-entrypoint.ts for
 * containers and VMs.
 */
import { buildServer } from './src/index.js';
import { registerRemoteClientRoutes } from './src/remote-client-api.js';
import { registerProbeFederationRoutes } from './src/probe-federation-api.js';
import { registerUnifiedProductRoutes } from './src/unified-product-api.js';
import { registerNotificationIncidentRoutes } from './src/notifications-api.js';
import { registerHistoryRoutes } from './src/history-api.js';

const app = await buildServer();

registerUnifiedProductRoutes(app);
registerRemoteClientRoutes(app);
registerProbeFederationRoutes(app);
registerNotificationIncidentRoutes(app);
registerHistoryRoutes(app);

// Fastify's Vercel integration instruments listen() to expose the app as a
// serverless function. Do not replace this with a raw Node request handler.
await app.listen({
  port: Number(process.env.PORT) || 3000,
  host: '0.0.0.0',
});
