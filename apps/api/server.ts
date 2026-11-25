/**
 * Vercel-native Fastify entrypoint.
 *
 * Vercel's Fastify adapter discovers the Fastify instance through listen().
 * Keep the standalone Node.js entrypoint at src/remote-entrypoint.ts for
 * containers and VMs.
 */
import { buildServer } from './src/index.js';

// buildServer() already registers every route group (including the durable-store-backed ones);
// registering them again throws FST_ERR_DUPLICATED_ROUTE at startup.
const app = await buildServer();

// Fastify's Vercel integration instruments listen() to expose the app as a
// serverless function. Do not replace this with a raw Node request handler.
await app.listen({
  port: Number(process.env.PORT) || 3000,
  host: '0.0.0.0',
});
