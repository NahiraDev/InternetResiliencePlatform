import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  loadManifest,
  parseChecksums,
  validateReleaseInventory,
} from './phase71-release.mjs';

const TAG = 'v1.2.3';
const manifest = await loadManifest();

const createdDirectories = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

const assetNames = (tag = TAG) =>
  manifest.assets.map((asset) => asset.filename.replaceAll('{tag}', tag));

/**
 * Creates a release asset directory.
 *
 * @param options.tag          release tag used for the asset names
 * @param options.omit         asset names that must not be written
 * @param options.extra        extra files written next to the assets
 * @param options.checksums    checksum file body, or 'none' to skip the file
 * @param options.tamper       asset names whose contents are changed after the
 *                             checksum file was generated
 */
const createInventory = async ({
  tag = TAG,
  omit = [],
  extra = [],
  checksums = 'auto',
  tamper = [],
} = {}) => {
  const directory = await mkdtemp(join(tmpdir(), 'irp-phase71-'));
  createdDirectories.push(directory);

  const names = assetNames(tag).filter((name) => !omit.includes(name));
  const payloads = new Map();

  for (const name of names) {
    const content = `payload:${name}`;
    payloads.set(name, content);
    await writeFile(join(directory, name), content);
  }

  for (const name of extra) {
    await writeFile(join(directory, name), `extra:${name}`);
  }

  if (checksums !== 'none') {
    const lines =
      checksums === 'auto'
        ? names.map((name) => `${sha256(payloads.get(name))}  ${name}`)
        : Array.isArray(checksums)
          ? checksums
          : String(checksums).split('\n');
    await writeFile(join(directory, manifest.checksums), `${lines.join('\n')}\n`);
  }

  for (const name of tamper) {
    await writeFile(join(directory, name), 'tampered-after-checksums');
  }

  return directory;
};

describe('Phase 71 release contract', () => {
  it('accepts a complete inventory with verified checksums', async () => {
    const directory = await createInventory();

    const result = await validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest });

    expect(result.tag).toBe(TAG);
    expect(result.assets).toEqual(expect.arrayContaining(assetNames(TAG)));
    expect(result.checksums).toHaveLength(manifest.assets.length);
  });

  it('rejects an inventory without a checksum file', async () => {
    const directory = await createInventory({ checksums: 'none' });

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(/missing checksum file SHA256SUMS\.txt/);
  });

  it('rejects a missing platform asset', async () => {
    const missing = assetNames(TAG)[0];
    const directory = await createInventory({ omit: [missing] });

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(new RegExp(`requires exactly one .* asset named ${missing.replace(/\./g, '\\.')}`));
  });

  it('rejects an asset whose name is not exactly the release tag', async () => {
    const directory = await createInventory({ extra: ['IRP-Android-debug-v1.2.3-extra.apk'] });

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(/unexpected release assets: IRP-Android-debug-v1\.2\.3-extra\.apk/);
  });

  it('rejects an empty asset', async () => {
    const name = assetNames(TAG)[0];
    const directory = await createInventory();
    await writeFile(join(directory, name), '');

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(new RegExp(`asset is missing or empty: ${name.replace(/\./g, '\\.')}`));
  });

  it('rejects forbidden artifacts', async () => {
    const directory = await createInventory({ extra: ['IRP-iOS-v1.2.3.ipa'] });

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(/forbidden release assets must not be published: IRP-iOS-v1\.2\.3\.ipa/);
  });

  it('rejects unexpected files next to the release assets', async () => {
    const directory = await createInventory({ extra: ['notes.txt'] });

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(/unexpected release assets: notes\.txt/);
  });

  it('rejects an asset whose contents changed after the checksums were generated', async () => {
    const name = assetNames(TAG)[1];
    const directory = await createInventory({ tamper: [name] });

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(new RegExp(`checksum mismatch for ${name.replace(/\./g, '\\.')}`));
  });

  it('rejects a checksum file that does not cover every asset', async () => {
    const names = assetNames(TAG);
    const directory = await createInventory({
      checksums: [`${sha256('payload:' + names[0])}  ${names[0]}`].join('\n'),
    });

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(new RegExp(`SHA256SUMS\\.txt is missing entries for: ${names[1].replace(/\./g, '\\.')}`));
  });

  it('rejects a checksum file with extra entries', async () => {
    const names = assetNames(TAG);
    const directory = await createInventory({
      checksums: [
        ...names.map((name) => `${sha256('payload:' + name)}  ${name}`),
        `${sha256('other')}  IRP-Other-v1.2.3.zip`,
      ].join('\n'),
    });

    await expect(
      validateReleaseInventory({ tag: TAG, assetsDir: directory, manifest }),
    ).rejects.toThrow(/SHA256SUMS\.txt lists unexpected entries: IRP-Other-v1\.2\.3\.zip/);
  });

  it('rejects an invalid release tag', async () => {
    const directory = await createInventory({ tag: 'v1.2.3-extra' });

    await expect(
      validateReleaseInventory({ tag: 'v1.2.3-extra', assetsDir: directory, manifest }),
    ).rejects.toThrow(/invalid release tag "v1\.2\.3-extra"/);
  });
});

describe('Phase 71 checksum parsing', () => {
  it('parses sha256sum output in text and binary mode', () => {
    const digest = 'a'.repeat(64);
    const entries = parseChecksums(`${digest}  asset.zip\n${'b'.repeat(64)} *asset.apk\n`);

    expect(entries).toEqual([
      { hash: digest, name: 'asset.zip' },
      { hash: 'b'.repeat(64), name: 'asset.apk' },
    ]);
  });

  it('rejects malformed entries', () => {
    expect(() => parseChecksums('not-a-checksum')).toThrow(/malformed checksum entry on line 1/);
  });

  it('rejects entries that escape the release directory', () => {
    const digest = 'a'.repeat(64);
    expect(() => parseChecksums(`${digest}  ../outside.zip`)).toThrow(/unsafe checksum entry/);
  });
});
