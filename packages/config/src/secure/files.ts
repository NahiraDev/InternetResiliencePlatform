import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecureConfigError } from './errors.js';

const posix = process.platform !== 'win32';

export const defaultSecureConfigDir = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string => {
  const override = env.IRP_SECURE_CONFIG_DIR?.trim();
  if (override) return resolve(override);
  if (platform === 'darwin')
    return join(homedir(), 'Library', 'Application Support', 'IRP', 'secure-config');
  if (platform === 'win32')
    return join(
      env.APPDATA?.trim() || join(homedir(), 'AppData', 'Roaming'),
      'IRP',
      'secure-config',
    );
  return join(env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config'), 'irp', 'secure-config');
};

const findRepositoryRoot = (): string | undefined => {
  let current = dirname(fileURLToPath(import.meta.url));
  while (current !== dirname(current)) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  return undefined;
};

/** Resolves symlinks of the closest existing ancestor so a link cannot smuggle the store into the repo. */
const canonical = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;
    return join(await canonical(parent), basename(path));
  }
};

export const assertOutsideRepository = async (
  dir: string,
  repositoryRoot: string | undefined = findRepositoryRoot(),
): Promise<string> => {
  const target = await canonical(resolve(dir));
  if (repositoryRoot) {
    const rel = relative(await canonical(repositoryRoot), target);
    if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)))
      throw new SecureConfigError(
        'unsafe_location',
        'The secure configuration directory must be outside the repository. Change IRP_SECURE_CONFIG_DIR.',
      );
  }
  return target;
};

const assertPrivate = (mode: number, what: string, fix: string) => {
  if (posix && (mode & 0o077) !== 0)
    throw new SecureConfigError(
      'unsafe_permissions',
      `${what} is accessible to other users. Fix with: chmod ${fix} <path>`,
    );
};

export const ensurePrivateDir = async (dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await stat(dir);
  assertPrivate(info.mode, `The secure configuration directory (${dir})`, '700');
};

/** Returns undefined when absent; refuses symlinks and files readable by other users. */
export const readPrivateFile = async (path: string): Promise<string | undefined> => {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new SecureConfigError('storage_unavailable', `Cannot access ${path}.`);
  }
  if (!info.isFile())
    throw new SecureConfigError(
      'unsafe_permissions',
      `${path} is not a regular file; refusing it.`,
    );
  assertPrivate(info.mode, `The file ${path}`, '600');
  return readFile(path, 'utf8');
};

/** Write to a fresh 0600 temp file, flush, then rename over the target. */
export const writePrivateFile = async (path: string, content: string): Promise<void> => {
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  } catch {
    await rm(temp, { force: true });
    throw new SecureConfigError('storage_unavailable', `Cannot write ${path}.`);
  }
  if (posix) {
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
};
