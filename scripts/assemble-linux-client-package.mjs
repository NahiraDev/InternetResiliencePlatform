#!/usr/bin/env node
/**
 * Assemble a self-contained production tree for the IRP Linux Full Client.
 *
 * Copies the linux-client dist plus every production dependency (workspace and
 * external, recursively including nested package roots from the pnpm store)
 * so the installed Debian package can resolve modules without the monorepo.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLIENT = join(ROOT, 'packages/linux-client');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/assemble-linux-client-package.mjs <target-dir>');
  process.exit(2);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const workspacePackages = new Map();
for (const entry of readdirSync(join(ROOT, 'packages'))) {
  const pkgJsonPath = join(ROOT, 'packages', entry, 'package.json');
  if (!existsSync(pkgJsonPath)) continue;
  const pkg = readJson(pkgJsonPath);
  if (pkg.name) workspacePackages.set(pkg.name, join(ROOT, 'packages', entry));
}

const requireCandidates = [
  createRequire(join(ROOT, 'package.json')),
  createRequire(join(CLIENT, 'package.json')),
  ...[...workspacePackages.values()].map((dir) => createRequire(join(dir, 'package.json'))),
];

/** @type {Map<string, string>} */
const externalRoots = new Map();

function resolveExternalRoot(name, fromRequire = null) {
  if (externalRoots.has(name)) return externalRoots.get(name);

  const tryReq = (req) => {
    try {
      return dirname(req.resolve(join(name, 'package.json')));
    } catch {
      try {
        const main = req.resolve(name);
        let dir = dirname(main);
        while (dir !== '/' && !existsSync(join(dir, 'package.json'))) {
          dir = dirname(dir);
        }
        if (existsSync(join(dir, 'package.json'))) return dir;
      } catch {
        return null;
      }
    }
    return null;
  };

  if (fromRequire) {
    const hit = tryReq(fromRequire);
    if (hit) {
      externalRoots.set(name, hit);
      return hit;
    }
  }

  for (const req of requireCandidates) {
    const hit = tryReq(req);
    if (hit) {
      externalRoots.set(name, hit);
      return hit;
    }
  }

  // Last resort: search already-resolved external package roots for nested installs.
  for (const root of externalRoots.values()) {
    const nested = join(root, 'node_modules', ...name.split('/'));
    if (existsSync(join(nested, 'package.json'))) {
      externalRoots.set(name, nested);
      return nested;
    }
  }

  return null;
}

const visitedWorkspace = new Set();
const visitedExternal = new Set();

function collect(name, fromRequire = null) {
  if (workspacePackages.has(name)) {
    if (visitedWorkspace.has(name)) return;
    visitedWorkspace.add(name);
    const pkg = readJson(join(workspacePackages.get(name), 'package.json'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) collect(dep);
    return;
  }

  if (visitedExternal.has(name)) return;
  visitedExternal.add(name);
  const root = resolveExternalRoot(name, fromRequire);
  if (!root) {
    console.warn(`warning: could not resolve external package ${name}`);
    return;
  }
  const pkg = readJson(join(root, 'package.json'));
  const nestedRequire = createRequire(join(root, 'package.json'));
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    collect(dep, nestedRequire);
  }
}

collect('@irp/linux-client');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

cpSync(join(CLIENT, 'package.json'), join(target, 'package.json'));
mkdirSync(join(target, 'dist'), { recursive: true });
cpSync(join(CLIENT, 'dist'), join(target, 'dist'), { recursive: true });

const nm = join(target, 'node_modules');
mkdirSync(nm, { recursive: true });

for (const name of visitedWorkspace) {
  if (name === '@irp/linux-client') continue;
  const workspaceDir = workspacePackages.get(name);
  const dest = join(nm, ...name.split('/'));
  mkdirSync(dest, { recursive: true });
  cpSync(join(workspaceDir, 'package.json'), join(dest, 'package.json'));
  const distSrc = join(workspaceDir, 'dist');
  if (existsSync(distSrc)) {
    cpSync(distSrc, join(dest, 'dist'), { recursive: true });
  } else {
    console.warn(`warning: ${name} has no dist/; package may fail at runtime`);
  }
}

for (const name of visitedExternal) {
  const srcRoot = externalRoots.get(name) ?? resolveExternalRoot(name);
  if (!srcRoot) continue;
  const dest = join(nm, ...name.split('/'));
  if (existsSync(dest)) continue;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(srcRoot, dest, {
    recursive: true,
    filter: (src) => {
      const base = relative(srcRoot, src);
      if (!base) return true;
      const top = base.split(/[\\/]/)[0];
      // Nested node_modules are flattened into the top-level package tree instead.
      if (top === 'node_modules') return false;
      if (/^(?:\.git|docs|test|tests|__tests__|example|examples)(?:$|[\\/])/i.test(base)) {
        return false;
      }
      return true;
    },
  });
}

const rootPkg = readJson(join(target, 'package.json'));
rootPkg.private = true;
writeFileSync(join(target, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      target: relative(ROOT, target),
      workspacePackages: [...visitedWorkspace].filter((n) => n !== '@irp/linux-client').length,
      externalPackages: visitedExternal.size,
    },
    null,
    2,
  ),
);
