/** `pnpm start:secure`: the standard API entrypoint, fed from the local secure configuration. */
import { SecureConfigError } from '@irp/config/secure';
import { prepareSecureEnvironment, redactConfigValues } from './secure-start.js';

try {
  const { fromStore, fromEnvironment } = await prepareSecureEnvironment();
  process.stdout.write(
    `[irp-api] Secure configuration loaded (names only). Stored: ${fromStore.join(', ') || 'none'}. ` +
      `Overridden by environment: ${fromEnvironment.join(', ') || 'none'}.\n`,
  );
  await import('./remote-entrypoint.js');
} catch (error) {
  // Never print the error object: Node attaches inputs (such as a connection URL) to some errors.
  const message =
    error instanceof SecureConfigError
      ? error.message
      : `API startup failed: ${redactConfigValues(error instanceof Error ? error.message : 'unknown error', process.env)}`;
  process.stderr.write(`[irp-api] ${message}\n`);
  process.exit(1);
}
