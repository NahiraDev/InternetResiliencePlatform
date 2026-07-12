import { Application } from '@irp/core';
import { loadConfig } from '@irp/config';
import { createLogger } from '@irp/logger';
export const createDaemon = (): Application => { const config = loadConfig(); const logger = createLogger(config.logger.level); return new Application(config, logger); };
if (process.argv[1]?.endsWith('index.js')) { const daemon = createDaemon(); await daemon.start(); process.on('SIGTERM', () => void daemon.stop().then(() => process.exit(0))); }
