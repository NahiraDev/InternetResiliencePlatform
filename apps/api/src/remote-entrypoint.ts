import { loadConfig } from '@irp/config';
import { buildServer } from './index.js';
import { registerRemoteClientRoutes } from './remote-client-api.js';

const config = loadConfig();
const server = await buildServer();
registerRemoteClientRoutes(server);

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await server.close();
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'API shutdown failed',
        signal,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
};

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
await server.listen({ host: config.api.host, port: config.api.port });
