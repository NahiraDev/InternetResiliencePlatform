/**
 * Application entrypoint for the IRP Linux Full Client.
 * Used by the Debian package, systemd unit, and `pnpm start`.
 * Library consumers should import from `./index.js` instead.
 */
import { runLinuxClient } from './index.js';

await runLinuxClient().catch((error: unknown) => {
  console.error('IRP Linux client failed to start:', error);
  process.exitCode = 1;
});
