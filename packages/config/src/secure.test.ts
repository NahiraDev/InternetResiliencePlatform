import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIG_FIELDS,
  SecureConfigStore,
  assertOutsideRepository,
  findProblems,
  linuxSecretService,
  loadSecureConfig,
  macKeychain,
  resolveKeyStore,
  windowsDpapi,
  type CommandRunner,
  type KeyStore,
} from './secure/index.js';

// Test fixtures only. None of these are real credentials or reachable hosts.
const FIXTURE = {
  DATABASE_URL: 'postgresql://fixture_user:fixture-db-pass@db.fixture.test:5432/fixture',
  JWT_SECRET: 'fixture-jwt-0123456789abcdefghijklmnop',
  REMOTE_CLIENT_CREDENTIAL_KEY: 'fixture-credential-0123456789abcdefghij',
  REMOTE_CLIENT_REFRESH_KEY: 'fixture-refresh-0123456789abcdefghijkl',
  IRP_EMAIL_WEBHOOK_URL: 'https://relay.fixture.test/hook',
  IRP_PUBLIC_BASE_URL: 'https://app.fixture.test',
};

const memoryKeys = (): KeyStore & { keys: Map<string, Buffer> } => {
  const keys = new Map<string, Buffer>();
  return {
    keys,
    description: 'test key store',
    get: async (account) => keys.get(account) ?? null,
    set: async (account, key) => void keys.set(account, key),
  };
};

let root: string;
let dir: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'irp-secure-'));
  dir = join(root, 'store');
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const open = (keyStore: KeyStore = memoryKeys()) => SecureConfigStore.open({ dir, keyStore });
const save = (store: SecureConfigStore, values: Record<string, string>) =>
  store.update((current) => ({ ...current, values: { ...current.values, ...values } }));

describe('encrypted store', () => {
  it('saves, updates and decrypts values', async () => {
    const store = await open();
    await save(store, FIXTURE);
    await save(store, { JWT_SECRET: 'fixture-rotated-0123456789abcdefghijk' });
    const values = (await store.read())!.values;
    expect(values.JWT_SECRET).toBe('fixture-rotated-0123456789abcdefghijk');
    expect(values.DATABASE_URL).toBe(FIXTURE.DATABASE_URL);
  });

  it('writes only ciphertext, privately, without leftover temp files', async () => {
    const store = await open();
    await save(store, FIXTURE);
    await save(store, FIXTURE);
    const raw = await readFile(store.path, 'utf8');
    for (const [name, value] of Object.entries(FIXTURE)) {
      expect(raw).not.toContain(value);
      expect(raw).not.toContain(name);
    }
    expect(JSON.parse(raw).algorithm).toBe('aes-256-gcm');
    expect(await readdir(dir)).toEqual(['config.enc.json']);
    if (process.platform !== 'win32') {
      expect((await stat(dir)).mode & 0o777).toBe(0o700);
      expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    }
  });

  it('keeps every concurrent update', async () => {
    const store = await open();
    await Promise.all(Object.entries(FIXTURE).map(([k, v]) => save(store, { [k]: v })));
    expect((await store.read())!.values).toEqual(FIXTURE);
  });

  it('rejects tampering and a wrong key', async () => {
    const keys = memoryKeys();
    const store = await open(keys);
    await save(store, FIXTURE);
    const raw = await readFile(store.path, 'utf8');
    const envelope = JSON.parse(raw);
    const bytes = Buffer.from(envelope.ciphertext, 'base64url');
    bytes[0] = bytes[0]! ^ 1;
    await writeFile(
      store.path,
      JSON.stringify({ ...envelope, ciphertext: bytes.toString('base64url') }),
    );
    await expect(store.read()).rejects.toMatchObject({ code: 'corrupt' });
    await writeFile(store.path, raw);
    for (const account of keys.keys.keys()) keys.keys.set(account, Buffer.alloc(32, 7));
    await expect(store.read()).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('does not mint a new key when the old one is gone', async () => {
    const keys = memoryKeys();
    const store = await open(keys);
    await save(store, FIXTURE);
    keys.keys.clear();
    await expect(store.read()).rejects.toMatchObject({ code: 'key_missing' });
    await expect(save(store, FIXTURE)).rejects.toMatchObject({ code: 'key_missing' });
    expect(keys.keys.size).toBe(0);
  });

  it('fails closed, writing nothing, when the credential store fails', async () => {
    const broken: KeyStore = {
      description: 'broken',
      get: async () => null,
      set: async () => undefined, // silently drops the key
    };
    const store = await open(broken);
    await expect(store.initialize()).rejects.toMatchObject({ code: 'storage_unavailable' });
    await expect(save(store, FIXTURE)).rejects.toMatchObject({ code: 'storage_unavailable' });
    expect(await readdir(dir)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('refuses loose permissions and symlinks', async () => {
    const store = await open();
    await save(store, FIXTURE);
    await chmod(store.path, 0o644);
    await expect(store.read()).rejects.toMatchObject({ code: 'unsafe_permissions' });
    await chmod(store.path, 0o600);
    await chmod(dir, 0o755);
    await expect(save(store, FIXTURE)).rejects.toMatchObject({ code: 'unsafe_permissions' });
    await chmod(dir, 0o700);
    await rm(store.path);
    await writeFile(join(root, 'elsewhere'), '{}', { mode: 0o600 });
    await symlink(join(root, 'elsewhere'), store.path);
    await expect(store.read()).rejects.toMatchObject({ code: 'unsafe_permissions' });
  });

  it('refuses a directory inside the repository, also through a symlink', async () => {
    const repository = fileURLToPath(new URL('../../../', import.meta.url));
    await expect(
      SecureConfigStore.open({ dir: join(repository, '.secrets'), keyStore: memoryKeys() }),
    ).rejects.toMatchObject({ code: 'unsafe_location' });
    await symlink(repository, join(root, 'link'), 'junction');
    await expect(assertOutsideRepository(join(root, 'link', 'x'))).rejects.toMatchObject({
      code: 'unsafe_location',
    });
  });
});

describe('operating system key stores', () => {
  const key = Buffer.alloc(32, 9);
  const recorder = (code: number, stdout = '', stderr = '') => {
    const calls: { command: string; args: readonly string[]; input?: string }[] = [];
    const run: CommandRunner = async (command, args, input) => {
      calls.push({ command, args, ...(input === undefined ? {} : { input }) });
      return { code, stdout, stderr };
    };
    return { calls, run };
  };

  it('never puts the key in process arguments', async () => {
    for (const make of [linuxSecretService, macKeychain]) {
      const { calls, run } = recorder(0);
      await make(run).set('account', key);
      expect(calls[0]!.args.join(' ')).not.toContain(key.toString('base64'));
      expect(calls[0]!.input).toContain(key.toString('base64'));
    }
    const { calls, run } = recorder(0, 'cHJvdGVjdGVk');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { mode: 0o700 });
    await windowsDpapi(dir, run).set('account', key);
    expect(calls[0]!.args.join(' ')).not.toContain(key.toString('base64'));
    expect(calls[0]!.input).toBe(key.toString('base64'));
  });

  it('distinguishes "no key yet" from a broken store', async () => {
    expect(await linuxSecretService(recorder(1).run).get('a')).toBeNull();
    expect(await macKeychain(recorder(44).run).get('a')).toBeNull();
    for (const store of [
      linuxSecretService(recorder(1, '', 'Cannot autolaunch D-Bus').run),
      linuxSecretService(recorder(127, '', 'command unavailable').run),
      macKeychain(recorder(51).run),
    ])
      await expect(store.get('a')).rejects.toMatchObject({ code: 'storage_unavailable' });
  });

  it('has no fallback on unsupported platforms', () => {
    expect(() => resolveKeyStore(dir, 'freebsd')).toThrow(/No supported/);
  });
});

describe('validation', () => {
  it('lists the six required production settings', () => {
    expect(
      CONFIG_FIELDS.filter((f) => f.required)
        .map((f) => f.name)
        .sort(),
    ).toEqual(Object.keys(FIXTURE).sort());
  });

  it('accepts complete fixtures', () => {
    expect(findProblems(FIXTURE)).toEqual({});
  });

  it('flags bad values without quoting them', () => {
    const bad = {
      DATABASE_URL: 'mysql://leak-marker@host/db',
      JWT_SECRET: 'leak-marker-short',
      IRP_EMAIL_WEBHOOK_URL: 'http://leak-marker.test',
      IRP_PUBLIC_BASE_URL: 'https://leak-marker.test/?q=1',
      API_PORT: 'leak-marker',
      IRP_TRUST_PROXY: 'true',
      LOG_LEVEL: 'leak-marker\nsecond',
    };
    const problems = findProblems(bad);
    expect(Object.keys(problems).sort()).toEqual(Object.keys(bad).sort());
    expect(JSON.stringify(problems)).not.toContain('leak-marker');
  });

  it('requires distinct signing keys', () => {
    expect(
      Object.keys(
        findProblems({ ...FIXTURE, REMOTE_CLIENT_REFRESH_KEY: FIXTURE.JWT_SECRET }),
      ).sort(),
    ).toEqual(['JWT_SECRET', 'REMOTE_CLIENT_REFRESH_KEY']);
  });
});

describe('runtime loading', () => {
  const source = (values: Record<string, string>) => ({ read: async () => ({ values }) });

  it('fills the environment from the store', async () => {
    const env: NodeJS.ProcessEnv = {};
    const result = await loadSecureConfig(env, source(FIXTURE));
    expect(env).toEqual(FIXTURE);
    expect(result.fromStore.sort()).toEqual(Object.keys(FIXTURE).sort());
  });

  it('lets existing environment variables win', async () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://env@127.0.0.1/env' };
    const result = await loadSecureConfig(env, source(FIXTURE));
    expect(env.DATABASE_URL).toBe('postgresql://env@127.0.0.1/env');
    expect(result.fromEnvironment).toEqual(['DATABASE_URL']);
  });

  it('fails on missing or invalid settings, naming keys only, without touching the environment', async () => {
    const env: NodeJS.ProcessEnv = {};
    const { JWT_SECRET: _omitted, ...rest } = FIXTURE;
    const error = await loadSecureConfig(
      env,
      source({ ...rest, IRP_PUBLIC_BASE_URL: 'http://leak-marker.test' }),
    ).catch((e: Error) => e);
    expect(error).toMatchObject({ code: 'invalid_configuration' });
    const message = (error as Error).message;
    expect(message).toContain('JWT_SECRET is missing');
    expect(message).toContain('IRP_PUBLIC_BASE_URL is invalid');
    expect(message).not.toContain('leak-marker');
    expect(message).not.toContain('fixture-db-pass');
    expect(env).toEqual({});
  });

  it('fails when nothing was ever saved', async () => {
    await expect(loadSecureConfig({}, { read: async () => undefined })).rejects.toMatchObject({
      code: 'not_configured',
    });
  });
});
