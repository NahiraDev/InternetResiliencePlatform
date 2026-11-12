#!/usr/bin/env node
/**
 * Phase 71 release inventory validator.
 *
 * Fails closed when a release inventory does not match the machine-readable
 * contract in `ops/release/phase-71-release.json`:
 *
 * - the release tag must be an exact semantic `vX.Y.Z` tag;
 * - every supported platform must contribute exactly one asset, named exactly
 *   as the contract requires for that tag (no near-miss versions such as
 *   `IRP-Android-debug-v1.2.3-extra.apk`);
 * - assets must be non-empty regular files;
 * - `SHA256SUMS.txt` must exist, must cover exactly the published assets, and
 *   every recorded digest must match the asset contents;
 * - forbidden artifacts (for example unsigned iOS `.ipa` bundles) are rejected;
 * - any unexpected file in the release directory is rejected.
 *
 * Usage: node scripts/phase71-release.mjs <release-tag> <assets-dir>
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifestPath = join(repoRoot, 'ops/release/phase-71-release.json');

export const loadManifest = async (manifestPath = defaultManifestPath) =>
  JSON.parse(await readFile(manifestPath, 'utf8'));

/**
 * Converts a manifest glob (`*.ipa`) into an anchored regular expression that
 * is matched against a single path segment (never across directories).
 */
export const globToRegExp = (glob) => {
  const escaped = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp(`^${pattern}$`);
};

/**
 * Resolves the exact expected file name for every contract asset.
 */
export const expectedAssets = (manifest, tag) =>
  manifest.assets.map((asset) => {
    if (typeof asset.filename !== 'string' || !asset.filename.includes('{tag}')) {
      throw new Error(
        `release manifest asset ${JSON.stringify(asset.platform ?? asset.filename)} must declare an exact "filename" containing {tag}`,
      );
    }
    return { ...asset, name: asset.filename.replaceAll('{tag}', tag) };
  });

/**
 * Parses a `sha256sum`-compatible checksum file.
 * Format: `<64 hex digest>  <file name>` (text mode) or `<64 hex digest> *<file name>` (binary mode).
 */
export const parseChecksums = (content) => {
  const entries = [];
  const lines = String(content).split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;

    const match = /^([0-9a-fA-F]{64}) ([ *])(.+)$/.exec(line.trim());
    if (!match) {
      throw new Error(`malformed checksum entry on line ${index + 1}: ${JSON.stringify(line)}`);
    }

    const name = match[3].trim();
    if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
      throw new Error(`unsafe checksum entry on line ${index + 1}: ${JSON.stringify(name)}`);
    }

    entries.push({ hash: match[1].toLowerCase(), name });
  }

  if (entries.length === 0) {
    throw new Error('checksum file does not contain any entries');
  }

  return entries;
};

const sha256File = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

/**
 * Validates a release asset directory against the Phase 71 contract.
 * Throws an Error describing the first contract violation.
 */
export const validateReleaseInventory = async ({ tag, assetsDir, manifest }) => {
  if (!tag || typeof tag !== 'string') {
    throw new Error('release tag argument is required');
  }
  if (!manifest.releaseTagPattern || !new RegExp(manifest.releaseTagPattern).test(tag)) {
    throw new Error(`invalid release tag ${JSON.stringify(tag)}; expected semantic vX.Y.Z`);
  }
  if (!assetsDir) {
    throw new Error('asset directory argument is required');
  }

  const assets = expectedAssets(manifest, tag);
  const expectedNames = new Set(assets.map((asset) => asset.name));
  if (expectedNames.size !== assets.length) {
    throw new Error('release manifest declares duplicate asset file names');
  }

  const dirEntries = await readdir(assetsDir, { withFileTypes: true });
  const entries = dirEntries.filter((entry) => !entry.name.startsWith('.'));
  const nonFiles = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  if (nonFiles.length > 0) {
    throw new Error(`release asset directory contains non-file entries: ${nonFiles.join(', ')}`);
  }

  const fileNames = new Set(entries.map((entry) => entry.name));
  if (fileNames.size === 0) {
    throw new Error(`no release assets found in ${assetsDir}`);
  }

  const checksumFileName = manifest.checksums ?? 'SHA256SUMS.txt';
  if (!fileNames.has(checksumFileName)) {
    throw new Error(`missing checksum file ${checksumFileName}`);
  }

  for (const asset of assets) {
    if (!fileNames.has(asset.name)) {
      throw new Error(`${asset.platform} requires exactly one ${asset.kind} asset named ${asset.name}`);
    }
    const fileStat = await stat(join(assetsDir, asset.name));
    if (!fileStat.isFile() || fileStat.size === 0) {
      throw new Error(`${asset.platform} asset is missing or empty: ${asset.name}`);
    }
  }

  const forbiddenPatterns = (manifest.forbidden ?? []).map(globToRegExp);
  const forbidden = [...fileNames].filter((name) =>
    forbiddenPatterns.some((pattern) => pattern.test(basename(name))),
  );
  if (forbidden.length > 0) {
    throw new Error(`forbidden release assets must not be published: ${forbidden.join(', ')}`);
  }

  const unexpected = [...fileNames].filter(
    (name) => !expectedNames.has(name) && name !== checksumFileName,
  );
  if (unexpected.length > 0) {
    throw new Error(`unexpected release assets: ${unexpected.join(', ')}`);
  }

  const checksumPath = join(assetsDir, checksumFileName);
  const checksums = await parseChecksums(await readFile(checksumPath, 'utf8'));

  const listedNames = new Set(checksums.map((entry) => entry.name));
  if (listedNames.size !== checksums.length) {
    throw new Error(`${checksumFileName} contains duplicate entries`);
  }

  const missingEntries = [...expectedNames].filter((name) => !listedNames.has(name));
  if (missingEntries.length > 0) {
    throw new Error(`${checksumFileName} is missing entries for: ${missingEntries.join(', ')}`);
  }

  const extraEntries = checksums.map((entry) => entry.name).filter((name) => !expectedNames.has(name));
  if (extraEntries.length > 0) {
    throw new Error(`${checksumFileName} lists unexpected entries: ${extraEntries.join(', ')}`);
  }

  for (const entry of checksums) {
    const digest = await sha256File(join(assetsDir, entry.name));
    if (digest !== entry.hash) {
      throw new Error(
        `checksum mismatch for ${entry.name}: recorded ${entry.hash}, computed ${digest}`,
      );
    }
  }

  return { tag, assets: [...expectedNames], checksums };
};

const isDirectInvocation =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
  const [, , tag, assetsDir] = process.argv;
  try {
    const manifest = await loadManifest();
    const result = await validateReleaseInventory({ tag, assetsDir, manifest });
    console.log(
      `PASS phase71: tag ${result.tag} publishes exactly ${result.assets.length} versioned assets with verified checksums and no forbidden artifacts`,
    );
  } catch (error) {
    console.error(`FAIL phase71: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
