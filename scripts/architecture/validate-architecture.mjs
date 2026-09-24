#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(process.env.IRP_ARCHITECTURE_ROOT ?? process.cwd());
const manifestPath = join(root, 'docs/architecture/IRP-ARCHITECTURE-CONTRACT.json');
const errors = [];

const fail = (message) => errors.push(message);
const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { fail(`${relative(root, path)}: invalid JSON: ${error.message}`); return null; }
};

if (!existsSync(manifestPath)) {
  fail('missing docs/architecture/IRP-ARCHITECTURE-CONTRACT.json');
} else {
  const manifest = readJson(manifestPath);
  if (manifest) {
    if (manifest.status !== 'binding') fail('architecture contract must have status=binding');
    if (manifest.canonicalRuntime?.package !== '@irp/resilience-runtime') fail('canonical runtime package is not @irp/resilience-runtime');
    if (manifest.canonicalRuntime?.symbol !== 'ResilienceRuntime') fail('canonical runtime symbol is not ResilienceRuntime');
    if (manifest.canonicalRuntime?.composition !== 'createCanonicalRuntime') fail('canonical runtime composition is not createCanonicalRuntime');
    if (manifest.canonicalRuntime?.productionAuthorityCount !== 1) fail('canonical runtime productionAuthorityCount must equal 1');

    const requiredPaths = [
      'AGENTS.md',
      'docs/architecture/IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md',
      'packages/resilience-runtime/src/index.ts',
      'packages/resilience-runtime/src/canonical-runtime-composition.ts',
    ];
    for (const path of requiredPaths) if (!existsSync(join(root, path))) fail(`required architecture path missing: ${path}`);

    for (const entry of manifest.hostEntrypoints ?? []) {
      if (!existsSync(join(root, entry))) fail(`declared host entrypoint missing: ${entry}`);
    }

    for (const pkg of Object.values(manifest.domainOwners ?? {})) {
      const packagePath = join(root, 'packages', pkg.replace('@irp/', ''));
      if (!existsSync(packagePath)) fail(`declared domain owner package missing: ${pkg}`);
    }
  }
}

const skipDirectories = new Set(['.git', 'node_modules', 'dist', '.turbo', 'coverage', 'artifacts']);
const productionRoots = ['apps', 'packages'];
const sourceFiles = [];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirectories.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) sourceFiles.push(full);
  }
}
for (const rootName of productionRoots) walk(join(root, rootName));

const isTestOrLegacy = (file) => {
  const rel = relative(root, file).replaceAll('\\', '/');
  return /(^|\/)(test|tests|__tests__)\//.test(rel) ||
    rel.includes('/src/legacy/') ||
    rel.startsWith('apps/') && rel.includes('/test/');
};

const prohibitedImportPatterns = [
  { name: 'NetworkAutopilot production authority', pattern: /(?:from|import\s*\(|require\()\s*['"][^'"]*(?:network-autopilot|NetworkAutopilot)[^'"]*['"]/ },
  { name: 'direct privileged shell execution from host layer', pattern: /(?:exec|execFile|spawn|spawnSync)\s*\(/ },
];

for (const file of sourceFiles) {
  if (isTestOrLegacy(file)) continue;
  const rel = relative(root, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');

  if (/NetworkAutopilot/.test(text)) {
    fail(`${rel}: production source references NetworkAutopilot`);
  }

  if (/new\s+ResilienceRuntime\s*\(/.test(text) &&
      !rel.startsWith('packages/resilience-runtime/')) {
    fail(`${rel}: host must use createCanonicalRuntime instead of constructing ResilienceRuntime directly`);
  }

  for (const rule of prohibitedImportPatterns) {
    if (rule.pattern.test(text) && /^(apps|packages)\/(?:api|cli|.*client|plugin)/.test(rel)) {
      fail(`${rel}: forbidden ${rule.name}`);
    }
  }

  if (/\b(?:DecisionEngine|PolicyEngine|SafetyKernel|StateRegistry|ProviderRegistry|EventBus|TransactionExecutor)\b/.test(text) &&
      !rel.startsWith('packages/resilience-runtime/')) {
    fail(`${rel}: possible competing architectural authority detected; extend the canonical runtime/domain owner instead`);
  }
}

const packageJsonPath = join(root, 'package.json');
if (existsSync(packageJsonPath)) {
  const packageJson = readJson(packageJsonPath);
  if (packageJson?.scripts?.['architecture:check'] !== 'node scripts/architecture/validate-architecture.mjs') {
    fail('package.json must expose architecture:check');
  }
}

if (errors.length) {
  console.error(`Architecture validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Architecture contract validation passed.');
