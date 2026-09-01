import { buildServer } from './index.js';
import { registerRemoteClientRoutes } from './remote-client-api.js';
import { registerProbeFederationRoutes } from './probe-federation-api.js';
import { registerUnifiedProductRoutes } from './unified-product-api.js';
import { registerNotificationIncidentRoutes } from './notifications-api.js';

/**
 * Build the API for Vercel's request/response runtime without binding a TCP port.
 * The regular remote entrypoint remains responsible for long-lived Docker/server
 * deployments and calls server.listen().
 */
export const buildVercelServer = async () => {
  const server = await buildServer();
  registerUnifiedProductRoutes(server);
  registerRemoteClientRoutes(server);
  registerProbeFederationRoutes(server);
  registerNotificationIncidentRoutes(server);
  await server.ready();
  return server;
};
