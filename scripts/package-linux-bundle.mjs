#!/usr/bin/env node
/**
 * Package the @irp/linux-client runtime as a self-contained, installable
 * pnpm mini-workspace bundle.
 *
 * The bundle contains the built client plus every transitive @irp workspace
 * dependency (dist + package.json), a root package.json and a
 * pnpm-workspace.yaml. Extracting it and running `pnpm install` produces a
 * runnable `node packages/linux-client/dist/main.js` without the monorepo.
 *
 * Usage: node scripts/package-linux-bundle.mjs <output-directory>
 */
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: package-linux-bundle.mjs <output-directory>');
  process.exit(1);
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf-8'));

const packagesDir = join(root, 'packages');
const packageNames = (await readdir(packagesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const manifests = new Map();
for (const dir of packageNames) {
  const file = join(packagesDir, dir, 'package.json');
  if (!existsSync(file)) continue;
  const manifest = await readJson(file);
  manifests.set(manifest.name, { dir, manifest });
}

const entry = '@irp/linux-client';
if (!manifests.has(entry)) {
  console.error(`FAIL: ${entry} not found under packages/`);
  process.exit(1);
}

// Breadth-first transitive closure over workspace dependencies.
const closure = new Map();
const queue = [entry];
while (queue.length > 0) {
  const name = queue.shift();
  if (closure.has(name)) continue;
  const record = manifests.get(name);
  if (!record) {
    console.error(`FAIL: workspace dependency ${name} not found under packages/`);
    process.exit(1);
  }
  closure.set(name, record);
  for (const dep of Object.keys(record.manifest.dependencies ?? {})) {
    if (dep.startsWith('@irp/')) queue.push(dep);
  }
}

for (const [name, { dir }] of closure) {
  const source = join(packagesDir, dir);
  const target = join(outDir, 'packages', dir);
  await mkdir(target, { recursive: true });
  await cp(join(source, 'package.json'), join(target, 'package.json'));
  const dist = join(source, 'dist');
  if (!existsSync(dist)) {
    console.error(`FAIL: ${name} has no dist/ — build the workspace first`);
    process.exit(1);
  }
  await cp(dist, join(target, 'dist'), { recursive: true });
}

const rootPackageJson = {
  name: 'irp-linux-bundle',
  version: '0.1.0',
  private: true,
  packageManager: 'pnpm@11.21.0',
  engines: { node: '>=24.0.0' },
};
await writeFile(join(outDir, 'package.json'), `${JSON.stringify(rootPackageJson, null, 2)}\n`);
await writeFile(join(outDir, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");

console.log(`Packaged ${closure.size} workspace packages into ${outDir}:`);
for (const [name] of closure) console.log(`  ${name}`);
