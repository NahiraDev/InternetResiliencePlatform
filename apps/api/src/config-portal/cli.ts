/**
 * `pnpm config:portal`            start the portal (creates the local administrator on first run)
 * `pnpm config:portal reset-admin`  replace the local administrator password
 *
 * The administrator password is only ever typed at an interactive terminal with echo off.
 */
import { SecureConfigError, SecureConfigStore } from '@irp/config/secure';
import { adminPasswordProblem, setAdminPassword } from './admin.js';
import { PORTAL_HOST, buildPortalServer } from './server.js';

const readHidden = (prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const input = process.stdin;
    // Echo must be off before the prompt invites input.
    input.setRawMode(true);
    process.stdout.write(prompt);
    input.setEncoding('utf8');
    input.resume();
    let typed = '';
    const finish = (error?: Error) => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(typed);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003' || char === '\u0004') return finish(new Error('Cancelled.'));
        if (char === '\u007f' || char === '\b') typed = typed.slice(0, -1);
        else if (char >= ' ') typed += char;
      }
    };
    input.on('data', onData);
  });

const createAdmin = async (store: SecureConfigStore): Promise<void> => {
  if (!process.stdin.isTTY)
    throw new Error('Creating the local administrator requires an interactive terminal.');
  process.stdout.write('Create the local administrator password for the configuration portal.\n');
  for (;;) {
    const first = await readHidden('New password: ');
    const problem = adminPasswordProblem(first);
    if (problem) {
      process.stdout.write(`${problem}\n`);
      continue;
    }
    if ((await readHidden('Repeat password: ')) !== first) {
      process.stdout.write('Passwords did not match.\n');
      continue;
    }
    await setAdminPassword(store, first);
    return;
  }
};

const main = async () => {
  const command = process.argv[2];
  if (command !== undefined && command !== 'reset-admin')
    throw new Error('Usage: pnpm config:portal [reset-admin]');
  const port = Number(process.env.IRP_CONFIG_PORTAL_PORT ?? 4780);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535)
    throw new Error('IRP_CONFIG_PORTAL_PORT must be between 1024 and 65535.');

  const store = await SecureConfigStore.open();
  await store.initialize();
  if (command === 'reset-admin') {
    await createAdmin(store);
    process.stdout.write('Password replaced. Restart the portal if it is running.\n');
    return;
  }
  if (!(await store.read())?.adminPasswordHash) await createAdmin(store);

  const app = buildPortalServer({ store, port });
  await app.listen({ host: PORTAL_HOST, port });
  process.stdout.write(
    `Configuration portal: http://${PORTAL_HOST}:${port}/\n` +
      `Storage: ${store.storageDescription}\nDirectory: ${store.dir}\nPress Ctrl+C to stop.\n`,
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => void app.close().finally(() => process.exit(0)));
};

main().catch((error: unknown) => {
  const known = error instanceof SecureConfigError || error instanceof Error;
  process.stderr.write(`${known ? (error as Error).message : 'The portal failed to start.'}\n`);
  process.exit(1);
});
