import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const workspaceRoots = ['apps', 'packages'];
const errors = [];
const manifests = [];

async function directories(path) {
  try {
    const entries = await readdir(join(root, path), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

for (const workspaceRoot of workspaceRoots) {
  for (const name of await directories(workspaceRoot)) {
    const path = join(root, workspaceRoot, name, 'package.json');
    try {
      const packageJson = JSON.parse(await readFile(path, 'utf8'));
      manifests.push({ path: relative(root, path), packageJson });
    } catch {
      errors.push(`${workspaceRoot}/${name}: missing or invalid package.json`);
    }
  }
}

if (manifests.length === 0) errors.push('No workspace manifests found under apps/ or packages/.');

const names = new Set();
for (const { path, packageJson } of manifests) {
  if (typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
    errors.push(`${path}: package name is missing`);
  } else if (names.has(packageJson.name)) {
    errors.push(`${path}: duplicate workspace package name '${packageJson.name}'`);
  } else {
    names.add(packageJson.name);
  }

  if (packageJson.private !== true && typeof packageJson.version !== 'string') {
    errors.push(`${path}: publishable package is missing version`);
  }

  if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
    errors.push(`${path}: scripts object is missing`);
  }
}

const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (rootPackage.packageManager !== 'pnpm@11.21.0') {
  errors.push(`root packageManager must remain pnpm@11.21.0 (found ${rootPackage.packageManager ?? 'missing'})`);
}
if (rootPackage.engines?.node !== '>=24.0.0') {
  errors.push(`root Node engine must remain >=24.0.0 (found ${rootPackage.engines?.node ?? 'missing'})`);
}

console.log(`Audited ${manifests.length} workspace manifests.`);
for (const manifest of manifests) {
  const scripts = Object.keys(manifest.packageJson.scripts ?? {}).sort().join(', ') || '(none)';
  console.log(`✓ ${manifest.packageJson.name} (${manifest.path}) scripts: ${scripts}`);
}

if (errors.length) {
  console.error('\nWorkspace contract violations:');
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}

console.log('\nAll workspace manifest contracts passed.');
