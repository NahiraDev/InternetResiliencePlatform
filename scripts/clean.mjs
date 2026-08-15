import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());

const TARGET_DIRECTORIES = new Set(['coverage', '.turbo', 'dist', 'node_modules']);

const IGNORE_DIRECTORIES = new Set(['.git']);

let removedCount = 0;
let removedBytes = 0;

function removeDirectory(path) {
  if (!existsSync(path)) return;

  try {
    const before = process.env.NODE_ENV === 'debug' ? 0 : 0;

    rmSync(path, {
      recursive: true,
      force: true,
    });

    removedCount += 1;

    console.log(`✓ Removed: ${path}`);

    if (before) {
      removedBytes += before;
    }
  } catch (error) {
    console.error(`✗ Failed to remove: ${path}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function walk(directory) {
  let entries;

  try {
    entries = readdirSync(directory, {
      withFileTypes: true,
    });
  } catch (error) {
    console.error(`✗ Failed to read: ${directory}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (!entry.isDirectory()) {
      continue;
    }

    if (IGNORE_DIRECTORIES.has(entry.name)) {
      continue;
    }

    if (TARGET_DIRECTORIES.has(entry.name)) {
      removeDirectory(fullPath);
      continue;
    }

    walk(fullPath);
  }
}

console.log('Cleaning InternetResiliencePlatform...');
console.log(`Root: ${ROOT}`);
console.log('');

walk(ROOT);

// Only remove the authoritative root lockfile.
// Do NOT recursively delete nested lockfiles.
const rootLockfile = join(ROOT, 'pnpm-lock.yaml');

if (existsSync(rootLockfile)) {
  try {
    rmSync(rootLockfile, { force: true });
    console.log(`✓ Removed: ${rootLockfile}`);
    removedCount += 1;
  } catch (error) {
    console.error(`✗ Failed to remove: ${rootLockfile}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

console.log('');
console.log(
  process.exitCode === 1
    ? 'Clean completed with errors.'
    : `Clean completed. Removed ${removedCount} item(s).`,
);
