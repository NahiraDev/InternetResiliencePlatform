import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildVercelServer } from '../apps/api/dist/vercel-entrypoint.js';

let serverPromise: ReturnType<typeof buildVercelServer> | undefined;

const getServer = () => {
  serverPromise ??= buildVercelServer();
  return serverPromise;
};

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const server = await getServer();
  server.server.emit('request', request, response);
}
