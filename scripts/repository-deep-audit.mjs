#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules', 'dist', '.turbo', 'coverage']);
const findings = [];
const workspaces = [];
const workflowFiles = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    findings.push({
      severity: 'P0',
      kind: 'invalid-json',
      path: relative(root, file),
      detail: error.message,
    });
    return null;
  }
}

const files = walk(root);
const relFiles = files.map((file) => relative(root, file));

for (const rel of relFiles) {
  const text = readFileSync(join(root, rel), 'utf8');
  if (/(^|\n)(?:<{7}|={7}|>{7})(?:\n|$)/.test(text)) {
    findings.push({
      severity: 'P0',
      kind: 'merge-conflict',
      path: rel,
      detail: 'merge-conflict marker present',
    });
  }
  if (rel.startsWith('.github/workflows/') && /\.ya?ml$/.test(rel))
    workflowFiles.push({ path: rel, text });
}

for (const workspaceRoot of ['apps', 'packages']) {
  const dir = join(root, workspaceRoot);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name, 'package.json');
    if (!existsSync(path)) {
      findings.push({
        severity: 'P0',
        kind: 'missing-manifest',
        path: relative(root, path),
        detail: 'workspace directory has no package.json',
      });
      continue;
    }
    const pkg = readJson(path);
    if (!pkg) continue;
    const rel = relative(root, path);
    const sourceFiles = files.filter((file) => {
      const candidate = relative(root, file);
      return (
        candidate.startsWith(`${workspaceRoot}/${entry.name}/src/`) &&
        /\.(?:ts|tsx|js|mjs|cjs)$/.test(candidate) &&
        !/\.(?:test|spec)\./.test(candidate)
      );
    });
    const testFiles = files.filter((file) => {
      const candidate = relative(root, file);
      return (
        candidate.startsWith(`${workspaceRoot}/${entry.name}/`) &&
        /(?:^|[\/])(src|test|tests)[\/].*\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/.test(candidate)
      );
    });
    const scripts = pkg.scripts ?? {};
    for (const script of ['build', 'lint', 'test', 'typecheck']) {
      if (typeof scripts[script] !== 'string' || scripts[script].trim() === '') {
        findings.push({
          severity: 'P1',
          kind: 'missing-script',
          path: rel,
          detail: `${script} script missing`,
        });
      }
    }
    if (sourceFiles.length > 0 && testFiles.length === 0) {
      findings.push({
        severity: 'P1',
        kind: 'untested-workspace',
        path: rel,
        detail: `${sourceFiles.length} source file(s) but no test file`,
      });
    }
    workspaces.push({
      name: pkg.name ?? '(unnamed)',
      path: rel,
      sourceFiles: sourceFiles.length,
      testFiles: testFiles.length,
      scripts: Object.keys(scripts).sort(),
    });
  }
}

const rootPackage = readJson(join(root, 'package.json'));
const pinnedPnpm = rootPackage?.packageManager;
// Corepack may pin the same package-manager release with an integrity suffix.
// Audit the executable version without rejecting that stronger supply-chain pin.
if (!/^pnpm@11\.21\.0(?:\+sha(?:256|384|512)\.[A-Za-z0-9]+)?$/.test(pinnedPnpm ?? ''))
  findings.push({
    severity: 'P0',
    kind: 'toolchain-drift',
    path: 'package.json',
    detail: `expected pnpm@11.21.0 (optionally Corepack integrity-pinned), found ${pinnedPnpm ?? 'missing'}`,
  });
if (rootPackage?.engines?.node !== '>=24.0.0')
  findings.push({
    severity: 'P0',
    kind: 'toolchain-drift',
    path: 'package.json',
    detail: `expected Node >=24.0.0, found ${rootPackage?.engines?.node ?? 'missing'}`,
  });

for (const workflow of workflowFiles) {
  const { path, text } = workflow;
  if (!/^name:\s*.+$/m.test(text))
    findings.push({
      severity: 'P1',
      kind: 'workflow-contract',
      path,
      detail: 'workflow name missing',
    });
  if (!/^(?:on|['"]on['"]):/m.test(text))
    findings.push({
      severity: 'P0',
      kind: 'workflow-contract',
      path,
      detail: 'workflow trigger missing',
    });
  if (!/actions\/checkout@v[0-9]+/.test(text) && !/actions\/download-artifact@v[0-9]+/.test(text))
    findings.push({
      severity: 'P1',
      kind: 'workflow-contract',
      path,
      detail: 'no checkout or approved artifact handoff',
    });
  if (!/actions\/setup-node@v[0-9]+/.test(text))
    findings.push({
      severity: 'P1',
      kind: 'workflow-contract',
      path,
      detail: 'setup-node missing',
    });
  if (!/pnpm\/action-setup@v[0-9]+/.test(text))
    findings.push({
      severity: 'P1',
      kind: 'workflow-contract',
      path,
      detail: 'pnpm setup missing',
    });
}

for (const forbidden of ['package-lock.json', 'yarn.lock', 'bun.lockb']) {
  if (existsSync(join(root, forbidden)))
    findings.push({
      severity: 'P0',
      kind: 'package-manager-artifact',
      path: forbidden,
      detail: 'forbidden package-manager lockfile present',
    });
}

/*
 * Content-derived fingerprint of the tracked source tree, used as the stable
 * `generatedAt` value for this report so that a clean checkout stays clean
 * after running the gate (mirrors the pattern in scripts/archaeology.mjs and
 * scripts/production-certification.mjs).
 *
 * This report file itself is excluded so running the audit does not change the
 * fingerprint, which would make every run non-idempotent (issue #18's pattern).
 */
const sourceContentHash = (() => {
  try {
    const { execFileSync } = createRequire(import.meta.url)('node:child_process');
    const { createHash } = createRequire(import.meta.url)('node:crypto');
    const ls = execFileSync(
      'git',
      [
        'ls-files',
        '--full-name',
        '--',
        '.',
        ':!artifacts',
        ':!docs/audits/repository-deep-audit.json',
      ],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    )
      .toString()
      .split('\n')
      .filter((p) => p.length > 0)
      .sort();
    if (ls.length === 0) return undefined;
    // Hash working-tree contents in batches (mirrors the batched optimization
    // applied to scripts/archaeology.mjs and scripts/production-certification.mjs).
    const digest = createHash('sha256');
    const batch = 64;
    for (let i = 0; i < ls.length; i += batch) {
      const chunk = ls.slice(i, i + batch);
      const out = execFileSync('git', ['hash-object', '--', ...chunk], {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
      })
        .toString()
        .split('\n')
        .filter((h) => h.length > 0);
      if (out.length !== chunk.length) {
        throw new Error(
          `git hash-object returned ${out.length} hashes for ${chunk.length} files`,
        );
      }
      chunk.forEach((rel, idx) => {
        digest.update(`${rel}\n${out[idx]}\n`);
      });
    }
    return digest.digest('hex');
  } catch {
    return undefined;
  }
})();

const report = {
  generatedAt: sourceContentHash ?? new Date().toISOString(),
  workspaceCount: workspaces.length,
  workflowCount: workflowFiles.length,
  findings,
  workspaces,
};

const reportPath = join(root, 'docs/audits/repository-deep-audit.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `Repository deep audit: ${workspaces.length} workspaces, ${workflowFiles.length} workflows, ${findings.length} finding(s).`,
);
for (const finding of findings)
  console.log(`[${finding.severity}] ${finding.kind} ${finding.path}: ${finding.detail}`);

if (findings.some((finding) => finding.severity === 'P0')) process.exit(1);
