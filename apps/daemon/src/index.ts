import { Application } from '@irp/core';
import { loadConfig } from '@irp/config';
import { createLogger } from '@irp/logger';
export const createDaemon = (): Application => {
  const config = loadConfig();
  const logger = createLogger(config.logger.level);
  return new Application(config, logger);
};
if (process.argv[1]?.endsWith('index.js')) {
  const daemon = createDaemon();
  await daemon.start();
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    daemon.logger.info('shutdown signal received', { signal });
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGTERM', (signal) => void shutdown(signal));
  process.on('SIGINT', (signal) => void shutdown(signal));
  process.on('SIGHUP', () => void daemon.reload(loadConfig()));
}
