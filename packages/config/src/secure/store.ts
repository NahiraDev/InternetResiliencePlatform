/**
 * Encrypted configuration file (AES-256-GCM via the canonical CryptoService of @irp/security) whose
 * key lives in the OS credential store. There is deliberately no plaintext mode.
 */
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { CryptoService, type EncryptedValue } from '@irp/security';
import { z } from 'zod';
import { SecureConfigError } from './errors.js';
import {
  assertOutsideRepository,
  defaultSecureConfigDir,
  ensurePrivateDir,
  readPrivateFile,
  writePrivateFile,
} from './files.js';
import { resolveKeyStore, type KeyStore } from './keystore.js';

const AAD = 'irp-secure-config:v1';
const FILE_NAME = 'config.enc.json';

const EnvelopeSchema = z.object({
  algorithm: z.literal('aes-256-gcm'),
  keyVersion: z.number(),
  iv: z.string(),
  tag: z.string().length(22),
  ciphertext: z.string(),
});

const DocumentSchema = z.object({
  adminPasswordHash: z.string().optional(),
  values: z.record(z.string(), z.string()),
});

export type SecureDocument = z.infer<typeof DocumentSchema>;

export interface SecureStoreOptions {
  dir?: string;
  keyStore?: KeyStore;
}

export class SecureConfigStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly crypto = new CryptoService();

  private constructor(
    readonly dir: string,
    private readonly keyStore: KeyStore,
  ) {}

  static async open(options: SecureStoreOptions = {}): Promise<SecureConfigStore> {
    const dir = await assertOutsideRepository(options.dir ?? defaultSecureConfigDir());
    return new SecureConfigStore(dir, options.keyStore ?? resolveKeyStore(dir));
  }

  get storageDescription(): string {
    return `AES-256-GCM encrypted file, key held in ${this.keyStore.description}`;
  }

  get path(): string {
    return join(this.dir, FILE_NAME);
  }

  private get account(): string {
    return createHash('sha256').update(this.dir).digest('hex').slice(0, 24);
  }

  /** Proves the credential store works (creating the key on first use) so startup can fail closed. */
  async initialize(): Promise<void> {
    await ensurePrivateDir(this.dir);
    if ((await this.read()) === undefined) await this.key(true);
  }

  private async key(create: boolean): Promise<Buffer> {
    const existing = await this.keyStore.get(this.account);
    if (existing) return existing;
    if (!create)
      throw new SecureConfigError(
        'key_missing',
        'The encrypted configuration exists but its key is not in the credential store (or the store ' +
          'is locked). Unlock it, or move the directory back if it was renamed. Only if the key is truly ' +
          'lost, remove the encrypted file and enter the values again.',
      );
    const key = randomBytes(32);
    await this.keyStore.set(this.account, key);
    const stored = await this.keyStore.get(this.account);
    if (!stored?.equals(key))
      throw new SecureConfigError(
        'storage_unavailable',
        'The credential store did not keep the key. Nothing was saved.',
      );
    return key;
  }

  /** Undefined means nothing has been saved yet. Tampering and wrong keys throw. */
  async read(): Promise<SecureDocument | undefined> {
    const raw = await readPrivateFile(this.path);
    if (raw === undefined) return undefined;
    const key = await this.key(false);
    try {
      const envelope: EncryptedValue = EnvelopeSchema.parse(JSON.parse(raw));
      // The AAD is fixed by this code, never taken from the file.
      const plaintext = this.crypto.decrypt({ ...envelope, aad: AAD }, key);
      return DocumentSchema.parse(JSON.parse(plaintext.toString('utf8')));
    } catch {
      throw new SecureConfigError(
        'corrupt',
        'The encrypted configuration could not be authenticated. It was modified or the key changed.',
      );
    }
  }

  /** Serialised read-modify-write with an atomic replace. */
  update(change: (current: SecureDocument) => SecureDocument): Promise<SecureDocument> {
    const next = this.queue.then(async () => {
      await ensurePrivateDir(this.dir);
      const current = await this.read();
      const document = DocumentSchema.parse(change(current ?? { values: {} }));
      const key = await this.key(current === undefined);
      const { aad: _aad, ...envelope } = this.crypto.encrypt(JSON.stringify(document), key, 1, AAD);
      await writePrivateFile(this.path, JSON.stringify(envelope));
      return document;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
