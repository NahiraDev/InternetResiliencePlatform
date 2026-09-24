#!/usr/bin/env node
/**
 * Assemble a self-contained production tree for the IRP Linux Full Client.
 *
 * Copies the linux-client dist plus every production dependency (workspace and
 * external) so the installed Debian package can resolve modules without the
 * monorepo or a fragile pnpm deploy step.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLIENT = join(ROOT, 'packages/linux-client');
const requireFromRoot = createRequire(join(ROOT, 'package.json'));

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

const visited = new Set();
const externalNames = new Set();

function collect(name) {
  if (visited.has(name)) return;
  visited.add(name);

  const workspaceDir = workspacePackages.get(name);
  if (workspaceDir) {
    const pkg = readJson(join(workspaceDir, 'package.json'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      collect(dep);
    }
    return;
  }

  externalNames.add(name);
}

collect('@irp/linux-client');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

// Root package (linux-client)
cpSync(join(CLIENT, 'package.json'), join(target, 'package.json'));
mkdirSync(join(target, 'dist'), { recursive: true });
cpSync(join(CLIENT, 'dist'), join(target, 'dist'), { recursive: true });

const nm = join(target, 'node_modules');
mkdirSync(nm, { recursive: true });

for (const name of visited) {
  if (name === '@irp/linux-client') continue;
  const workspaceDir = workspacePackages.get(name);
  if (!workspaceDir) continue;

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

/** Copy an external package (and its nested files) from the monorepo resolution. */
function copyExternal(name) {
  let resolved;
  try {
    resolved = requireFromRoot.resolve(join(name, 'package.json'));
  } catch {
    try {
      // Some packages export only a main file; resolve the package root via the main entry.
      const main = requireFromRoot.resolve(name);
      let dir = dirname(main);
      while (dir !== '/' && !existsSync(join(dir, 'package.json'))) {
        dir = dirname(dir);
      }
      resolved = join(dir, 'package.json');
    } catch (error) {
      console.warn(`warning: could not resolve external package ${name}: ${error.message}`);
      return;
    }
  }

  const srcRoot = dirname(resolved);
  const dest = join(nm, ...name.split('/'));
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(srcRoot, dest, {
    recursive: true,
    filter: (src) => {
      const base = relative(srcRoot, src);
      if (!base) return true;
      // Skip bulky non-runtime paths when present.
      if (base.split(/[\\/]/)[0] === 'node_modules') return false;
      if (/(^|[\\/])(\.git|docs|test|tests|__tests__|example|examples)([\\/]|$)/i.test(base)) {
        return false;
      }
      return true;
    },
  });
}

for (const name of externalNames) {
  copyExternal(name);
}

// Ensure package.json declares type module for the installed tree.
const rootPkg = readJson(join(target, 'package.json'));
rootPkg.private = true;
writeFileSync(join(target, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      target: relative(ROOT, target),
      workspacePackages: [...visited].filter((n) => n !== '@irp/linux-client').length,
      externalPackages: externalNames.size,
    },
    null,
    2,
  ),
);
