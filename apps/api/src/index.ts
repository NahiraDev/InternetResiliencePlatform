import Fastify from 'fastify';
import { loadConfig } from '@irp/config';
export const buildServer = () => { const app = Fastify({ logger: false }); app.get('/health', async () => ({ status: 'ok' })); app.get('/version', async () => ({ name: 'InternetResiliencePlatform', version: '0.1.0' })); app.get('/status', async () => ({ status: 'not_configured' })); return app; };
if (process.argv[1]?.endsWith('index.js')) { const config = loadConfig(); const server = buildServer(); await server.listen({ host: config.api.host, port: config.api.port }); }
