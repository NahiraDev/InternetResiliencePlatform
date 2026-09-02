import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

const root = process.cwd();
const manifestPath = join(root, 'ops/release/phase-71-release.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const fail = (message) => {
  console.error(`FAIL phase71: ${message}`);
  process.exit(1);
};

const pass = (message) => console.log(`PASS phase71: ${message}`);

const tag = process.argv[2];
if (!tag || !new RegExp(manifest.releaseTagPattern).test(tag)) {
  fail(`invalid release tag ${JSON.stringify(tag)}; expected semantic vX.Y.Z`);
}

const assetsDir = process.argv[3];
if (!assetsDir) {
  fail('asset directory argument is required');
}

const entries = (await readdir(assetsDir)).filter((name) => !name.startsWith('.'));
if (entries.length === 0) {
  fail(`no release assets found in ${assetsDir}`);
}

for (const asset of manifest.assets) {
  const matches = entries.filter((name) => new RegExp(asset.pattern).test(name));
  if (matches.length !== 1) {
    fail(`${asset.platform} requires exactly one ${asset.kind} asset; found ${matches.length}: ${matches.join(', ') || 'none'}`);
  }
  const filePath = join(assetsDir, matches[0]);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size === 0) {
    fail(`${asset.platform} asset is missing or empty: ${matches[0]}`);
  }
  if (!matches[0].includes(tag)) {
    fail(`${asset.platform} asset is not versioned with ${tag}: ${matches[0]}`);
  }
}

const forbidden = entries.filter((name) => name.toLowerCase().endsWith('.ipa'));
if (forbidden.length > 0) {
  fail(`unsigned iOS distribution must not publish IPA assets: ${forbidden.join(', ')}`);
}

const expected = new Set([
  ...manifest.assets.map((asset) => new RegExp(asset.pattern)),
  /^SHA256SUMS\.txt$/,
]);
const unexpected = entries.filter((name) => ![...expected].some((pattern) => pattern.test(basename(name))));
if (unexpected.length > 0) {
  fail(`unexpected release assets: ${unexpected.join(', ')}`);
}

pass(`tag ${tag} contains exactly one versioned asset per supported platform and no unsigned IPA`);
