/**
 * Application entrypoint for the IRP Linux Full Client.
 * Used by the Debian package, systemd unit, and `pnpm start`.
 * Library consumers should import from `./index.js` instead.
 */
import { runLinuxClient } from './index.js';

const server = await runLinuxClient().catch((error: unknown) => {
  console.error('IRP Linux client failed to start:', error);
  process.exitCode = 1;
  return undefined;
});

if (server) {
  let stopping = false;
  const shutdown = async (signal: 'SIGTERM' | 'SIGINT') => {
    if (stopping) return;
    stopping = true;
    try {
      console.info(`IRP Linux client received ${signal}; draining runtime and closing server`);
      await server.stop();
    } catch (error) {
      console.error('IRP Linux client shutdown failed:', error);
      process.exitCode = 1;
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}
