#!/usr/bin/env node
/**
 * Package the @irp/linux-client runtime as a reproducible, installable
 * pnpm mini-workspace bundle.
 *
 * The bundle contains the built client plus every transitive @irp workspace
 * dependency (dist + package.json only), a root package.json, a
 * pnpm-workspace.yaml, a README with operating procedures, the repository
 * LICENSE, and a pnpm-lock.yaml pinned to the exact external dependency
 * versions the repository lockfile resolves. Consumers install with
 * `pnpm install --frozen-lockfile`, so they run the same versions the
 * repository CI tested — no floating resolution.
 *
 * Usage: node scripts/package-linux-bundle.mjs <output-directory>
 *
 * Requires: built workspace (turbo run build --filter=@irp/linux-client...),
 * pnpm >= 11.21.0 on PATH, and network access to the npm registry for
 * lockfile generation.
 */
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Transitive closure of @irp workspace dependencies starting at `entry`.
 * Throws on a dependency that does not exist under packages/.
 */
export const computeWorkspaceClosure = (manifests, entry) => {
  const closure = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const name = queue.shift();
    if (closure.has(name)) continue;
    const record = manifests.get(name);
    if (!record) throw new Error(`workspace dependency ${name} not found under packages/`);
    closure.set(name, record);
    for (const dep of Object.keys(record.manifest.dependencies ?? {})) {
      if (dep.startsWith('@irp/')) queue.push(dep);
    }
  }
  return closure;
};

/** Ascending semver-ish comparison for plain `x.y.z` version strings. */
export const compareVersions = (a, b) => {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const left = pa[i] ?? 0;
    const right = pb[i] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
};

/**
 * External (registry) resolutions are `name@version:` keys in the lockfile
 * `packages:` section; workspace links use `link:` or file paths. The
 * top-level `packages:` section is the LAST one in the file (pnpm also emits
 * nested `packages:` keys inside the importers section).
 */
export const extractExternalVersions = (text) => {
  const versions = new Map();
  const packagesSection = text.split(/^packages:\n/m).pop() ?? '';
  for (const match of packagesSection.matchAll(/^ {2}'?([^:\n]+?)@([0-9][^:\n]*?)'?:/gm)) {
    const name = match[1];
    const version = match[2];
    // Peer-suffixed keys such as pg-pool@3.14.0(pg@8.23.0) keep the base version.
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(version.split('(')[0]);
  }
  return versions;
};

/**
 * Importer resolutions from a pnpm lockfile: importer path -> dependency name
 * -> resolved version (workspace `link:` targets excluded).
 */
export const extractImporterVersions = (text) => {
  const importers = new Map();
  const section = text.split(/^importers:\n/m)[1] ?? '';
  const endOfSection = section.split(/^\S/m)[0] ?? section;
  for (const importerMatch of endOfSection.matchAll(/^ {2}(\S[^:\n]*):\n/gm)) {
    const importerPath = importerMatch[1];
    const blockStart = importerMatch.index + importerMatch[0].length;
    const nextImporter = endOfSection.slice(blockStart).search(/^ {2}\S[^:\n]*:\n/gm);
    const block = endOfSection.slice(
      blockStart,
      nextImporter === -1 ? undefined : blockStart + nextImporter,
    );
    const deps = new Map();
    for (const depMatch of block.matchAll(/^ {6}(\S[^:\n]*):\n {8}specifier: .*\n {8}version: (.+)$/gm)) {
      const version = depMatch[2].trim();
      if (!version.startsWith('link:')) deps.set(depMatch[1], version);
    }
    if (deps.size > 0) importers.set(importerPath, deps);
  }
  return importers;
};

/**
 * Pin selection for the bundle closure. Direct dependencies are pinned to the
 * exact version the closure's own importers resolve in the repository
 * lockfile. Transitive dependencies fall back to the repository-wide
 * resolution (single version, or the highest when the repository resolves
 * several). Returns problems that must fail the packaging when a dependency
 * cannot be pinned safely.
 */
export const selectPinnedVersions = ({
  repoVersions,
  importerVersions,
  closureDirs,
  bundleExternals,
}) => {
  const pins = {};
  const problems = [];
  for (const name of bundleExternals) {
    const importerSet = new Set();
    for (const dir of closureDirs) {
      const version = importerVersions.get(`packages/${dir}`)?.get(name);
      if (version) importerSet.add(version);
    }
    if (importerSet.size === 1) {
      pins[name] = [...importerSet][0];
      continue;
    }
    if (importerSet.size > 1) {
      problems.push(
        `${name}: closure importers resolve different versions (${[...importerSet].join(', ')}) — a single override cannot pin it`,
      );
      continue;
    }
    const repoSet = repoVersions.get(name);
    if (!repoSet) {
      problems.push(`${name}: not present in the repository lockfile`);
      continue;
    }
    pins[name] = [...repoSet].sort(compareVersions).pop();
  }
  return { pins, problems };
};

const main = async () => {
  const root = process.cwd();
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('usage: package-linux-bundle.mjs <output-directory>');
    process.exit(1);
  }

  const fail = (message) => {
    console.error(`FAIL package-linux-bundle: ${message}`);
    process.exit(1);
  };

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
  if (!manifests.has(entry)) fail(`${entry} not found under packages/`);

  // Breadth-first transitive closure over workspace dependencies.
  const closure = computeWorkspaceClosure(manifests, entry);

  for (const [name, { dir, manifest }] of closure) {
    const source = join(packagesDir, dir);
    const target = join(outDir, 'packages', dir);
    await mkdir(target, { recursive: true });
    // Production-only closure: the bundle must not resolve development
    // dependencies (vitest, vite, ...) — only what the runtime imports.
    const shippedManifest = { ...manifest };
    delete shippedManifest.devDependencies;
    await writeFile(
      join(target, 'package.json'),
      `${JSON.stringify(shippedManifest, null, 2)}\n`,
    );
    const dist = join(source, 'dist');
    if (!existsSync(dist)) fail(`${name} has no dist/ — build the workspace first`);
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
  // protobufjs (via @opentelemetry) ships a postinstall build script; pnpm 11
  // fails the install when a build script is ignored. pnpm 11 reads `allowBuilds`
  // from pnpm-workspace.yaml (the package.json "pnpm" field is no longer read).
  await writeFile(
    join(outDir, 'pnpm-workspace.yaml'),
    ["packages:", "  - 'packages/*'", '', 'allowBuilds:', '  protobufjs: true', ''].join('\n'),
  );

  // Operating procedures and license notices travel with the bundle.
  const readmeSource = join(root, 'docs', 'release', 'linux-bundle-README.md');
  if (!existsSync(readmeSource)) fail('docs/release/linux-bundle-README.md is missing');
  await cp(readmeSource, join(outDir, 'README.md'));
  const license = join(root, 'LICENSE');
  if (!existsSync(license)) fail('LICENSE is missing at the repository root');
  await cp(license, join(outDir, 'LICENSE'));

  // Generate the bundle lockfile from the same dependency ranges the repository
  // locks, then pin and verify the resolved external versions against the
  // repository lockfile so consumers cannot float past what CI tested.
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const generateLockfile = () =>
    spawnSync(pnpm, ['install', '--lockfile-only'], {
      cwd: outDir,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  let lockfileOnly = generateLockfile();
  if (lockfileOnly.status !== 0) {
    fail(`lockfile generation failed (pnpm install --lockfile-only):\n${lockfileOnly.stderr}`);
  }
  const bundleLockfile = join(outDir, 'pnpm-lock.yaml');
  if (!existsSync(bundleLockfile)) fail('pnpm install --lockfile-only produced no pnpm-lock.yaml');

  const repositoryLock = await readFile(join(root, 'pnpm-lock.yaml'), 'utf-8');
  const repoVersions = extractExternalVersions(repositoryLock);
  const firstPass = extractExternalVersions(await readFile(bundleLockfile, 'utf-8'));

  const { pins: overrides, problems } = selectPinnedVersions({
    repoVersions,
    importerVersions: extractImporterVersions(repositoryLock),
    closureDirs: [...closure.values()].map(({ dir }) => dir),
    bundleExternals: firstPass.keys(),
  });
  if (problems.length > 0) {
    fail(`cannot pin the bundle closure safely:\n  ${problems.join('\n  ')}`);
  }
  const workspaceYaml = await readFile(join(outDir, 'pnpm-workspace.yaml'), 'utf8');
  const overrideLines = Object.entries(overrides)
    .map(([name, version]) => `  "${name}": "${version}"`)
    .join('\n');
  await writeFile(
    join(outDir, 'pnpm-workspace.yaml'),
    `${workspaceYaml.trimEnd()}\n\noverrides:\n${overrideLines}\n`,
  );
  lockfileOnly = generateLockfile();
  if (lockfileOnly.status !== 0) {
    fail(`pinned lockfile regeneration failed:\n${lockfileOnly.stderr}`);
  }

  const bundleVersions = extractExternalVersions(await readFile(bundleLockfile, 'utf8'));
  const drifted = [];
  for (const [name, versions] of bundleVersions) {
    const repoSet = repoVersions.get(name);
    if (!repoSet) {
      drifted.push(`${name}: not present in the repository lockfile`);
      continue;
    }
    for (const version of versions) {
      if (!repoSet.has(version)) {
        drifted.push(`${name}@${version}: does not match repository lockfile (${[...repoSet].join(', ')})`);
      }
    }
  }
  if (drifted.length > 0) {
    fail(
      `bundle dependency resolution drifted from the repository lockfile:\n  ${drifted.join('\n  ')}\n` +
        'Pin the bundle to the repository-locked versions before publishing.',
    );
  }

  console.log(`Packaged ${closure.size} workspace packages into ${outDir}:`);
  for (const [name] of closure) console.log(`  ${name}`);
  console.log('Bundle lockfile generated, pinned and verified against the repository lockfile.');
  console.log(`External packages covered: ${bundleVersions.size}`);
};

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await main();
}
