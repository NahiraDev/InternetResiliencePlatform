/**
 * Holds the 32-byte master key in the operating system's protected storage. Key material is passed to
 * helper tools over stdin only, never as a process argument, and helper output is never logged.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { SecureConfigError } from './errors.js';
import { readPrivateFile, writePrivateFile } from './files.js';

export interface KeyStore {
  readonly description: string;
  /** Returns null only when the store works and holds no key; every other failure throws. */
  get(account: string): Promise<Buffer | null>;
  set(account: string, key: Buffer): Promise<void>;
}

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}
export type CommandRunner = (
  command: string,
  args: readonly string[],
  input?: string,
) => Promise<CommandResult>;

export const runCommand: CommandRunner = (command, args, input) =>
  new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', () => resolve({ code: 127, stdout: '', stderr: 'command unavailable' }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.on('error', () => undefined);
    child.stdin.end(input ?? '');
  });

const SERVICE = 'com.nahiradev.irp.secure-config';

const decodeKey = (text: string): Buffer => {
  const key = Buffer.from(text.trim(), 'base64');
  if (key.length !== 32)
    throw new SecureConfigError('corrupt', 'The stored master key has an unexpected format.');
  return key;
};

const unavailable = (message: string) => new SecureConfigError('storage_unavailable', message);

const LINUX_HELP =
  'The Linux Secret Service is not usable. Install libsecret-tools and a keyring (for example ' +
  'gnome-keyring or KWallet with Secret Service), run the portal inside your logged-in desktop ' +
  'session, and unlock the keyring. Nothing was stored in plaintext.';

export const linuxSecretService = (run: CommandRunner = runCommand): KeyStore => ({
  description: 'Linux Secret Service (libsecret)',
  async get(account) {
    const result = await run('secret-tool', ['lookup', 'service', SERVICE, 'account', account]);
    if (result.code === 0 && result.stdout.trim()) return decodeKey(result.stdout);
    // secret-tool reports "no such item" as exit 1 with no diagnostics.
    if (result.code === 1 && !result.stderr.trim()) return null;
    throw unavailable(LINUX_HELP);
  },
  async set(account, key) {
    const result = await run(
      'secret-tool',
      ['store', '--label=IRP secure configuration key', 'service', SERVICE, 'account', account],
      key.toString('base64'),
    );
    if (result.code !== 0) throw unavailable(LINUX_HELP);
  },
});

const MAC_HELP = 'The macOS Keychain is not usable. Unlock your login keychain and retry.';

export const macKeychain = (run: CommandRunner = runCommand): KeyStore => ({
  description: 'macOS Keychain',
  async get(account) {
    const result = await run('/usr/bin/security', [
      'find-generic-password',
      '-s',
      SERVICE,
      '-a',
      account,
      '-w',
    ]);
    if (result.code === 0) return decodeKey(result.stdout);
    if (result.code === 44) return null; // errSecItemNotFound
    throw unavailable(MAC_HELP);
  },
  async set(account, key) {
    // `security -i` reads the command from stdin, keeping the key out of the process list.
    const result = await run(
      '/usr/bin/security',
      ['-i'],
      `add-generic-password -U -s "${SERVICE}" -a "${account}" -w "${key.toString('base64')}"\n`,
    );
    if (result.code !== 0) throw unavailable(MAC_HELP);
  },
});

const DPAPI_HELP = 'Windows Data Protection (DPAPI) is not usable for the current user.';

const dpapi = (operation: 'Protect' | 'Unprotect') =>
  [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Security',
    '$data = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
    `$out = [Security.Cryptography.ProtectedData]::${operation}($data, $null, 'CurrentUser')`,
    '[Console]::Out.Write([Convert]::ToBase64String($out))',
  ].join('; ');

/** The key is kept in a file that only the current Windows user can unprotect (DPAPI). */
export const windowsDpapi = (dir: string, run: CommandRunner = runCommand): KeyStore => {
  const invoke = async (operation: 'Protect' | 'Unprotect', input: string) => {
    const result = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', dpapi(operation)],
      input,
    );
    if (result.code !== 0 || !result.stdout.trim()) throw unavailable(DPAPI_HELP);
    return result.stdout.trim();
  };
  const path = (account: string) => join(dir, `master-key-${account}.dpapi`);
  return {
    description: 'Windows DPAPI (current user)',
    async get(account) {
      const protectedKey = await readPrivateFile(path(account));
      if (protectedKey === undefined) return null;
      return decodeKey(await invoke('Unprotect', protectedKey));
    },
    async set(account, key) {
      await writePrivateFile(path(account), await invoke('Protect', key.toString('base64')));
    },
  };
};

export const resolveKeyStore = (
  dir: string,
  platform: NodeJS.Platform = process.platform,
  run: CommandRunner = runCommand,
): KeyStore => {
  if (platform === 'linux') return linuxSecretService(run);
  if (platform === 'darwin') return macKeychain(run);
  if (platform === 'win32') return windowsDpapi(dir, run);
  throw unavailable('No supported operating-system credential store exists on this platform.');
};
