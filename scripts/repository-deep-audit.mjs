#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

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
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) {
    findings.push({ severity: 'P0', kind: 'invalid-json', path: relative(root, file), detail: error.message });
    return null;
  }
}

const files = walk(root);
const relFiles = files.map((file) => relative(root, file));

for (const rel of relFiles) {
  const text = readFileSync(join(root, rel), 'utf8');
  if (/(^|\n)(?:<{7}|={7}|>{7})(?:\n|$)/.test(text)) {
    findings.push({ severity: 'P0', kind: 'merge-conflict', path: rel, detail: 'merge-conflict marker present' });
  }
  if (rel.startsWith('.github/workflows/') && /\.ya?ml$/.test(rel)) workflowFiles.push({ path: rel, text });
}

for (const workspaceRoot of ['apps', 'packages']) {
  const dir = join(root, workspaceRoot);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name, 'package.json');
    if (!existsSync(path)) {
      findings.push({ severity: 'P0', kind: 'missing-manifest', path: relative(root, path), detail: 'workspace directory has no package.json' });
      continue;
    }
    const pkg = readJson(path);
    if (!pkg) continue;
    const rel = relative(root, path);
    const sourceFiles = files.filter((file) => {
      const candidate = relative(root, file);
      return candidate.startsWith(`${workspaceRoot}/${entry.name}/src/`) && /\.(?:ts|tsx|js|mjs|cjs)$/.test(candidate) && !/\.(?:test|spec)\./.test(candidate);
    });
    const testFiles = files.filter((file) => {
      const candidate = relative(root, file);
      return candidate.startsWith(`${workspaceRoot}/${entry.name}/`) && /(?:^|[\/])(src|test|tests)[\/].*\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/.test(candidate);
    });
    const scripts = pkg.scripts ?? {};
    for (const script of ['build', 'lint', 'test', 'typecheck']) {
      if (typeof scripts[script] !== 'string' || scripts[script].trim() === '') {
        findings.push({ severity: 'P1', kind: 'missing-script', path: rel, detail: `${script} script missing` });
      }
    }
    if (sourceFiles.length > 0 && testFiles.length === 0) {
      findings.push({ severity: 'P1', kind: 'untested-workspace', path: rel, detail: `${sourceFiles.length} source file(s) but no test file` });
    }
    workspaces.push({ name: pkg.name ?? '(unnamed)', path: rel, sourceFiles: sourceFiles.length, testFiles: testFiles.length, scripts: Object.keys(scripts).sort() });
  }
}

const rootPackage = readJson(join(root, 'package.json'));
if (rootPackage?.packageManager !== 'pnpm@11.21.0') findings.push({ severity: 'P0', kind: 'toolchain-drift', path: 'package.json', detail: `expected pnpm@11.21.0, found ${rootPackage?.packageManager ?? 'missing'}` });
if (rootPackage?.engines?.node !== '>=24.0.0') findings.push({ severity: 'P0', kind: 'toolchain-drift', path: 'package.json', detail: `expected Node >=24.0.0, found ${rootPackage?.engines?.node ?? 'missing'}` });

for (const workflow of workflowFiles) {
  const { path, text } = workflow;
  if (!/^name:\s*.+$/m.test(text)) findings.push({ severity: 'P1', kind: 'workflow-contract', path, detail: 'workflow name missing' });
  if (!/^(?:on|['"]on['"]):/m.test(text)) findings.push({ severity: 'P0', kind: 'workflow-contract', path, detail: 'workflow trigger missing' });
  if (!/actions\/checkout@v[0-9]+/.test(text) && !/actions\/download-artifact@v[0-9]+/.test(text)) findings.push({ severity: 'P1', kind: 'workflow-contract', path, detail: 'no checkout or approved artifact handoff' });
  if (!/actions\/setup-node@v[0-9]+/.test(text)) findings.push({ severity: 'P1', kind: 'workflow-contract', path, detail: 'setup-node missing' });
  if (!/pnpm\/action-setup@v[0-9]+/.test(text)) findings.push({ severity: 'P1', kind: 'workflow-contract', path, detail: 'pnpm setup missing' });
}

for (const forbidden of ['package-lock.json', 'yarn.lock', 'bun.lockb']) {
  if (existsSync(join(root, forbidden))) findings.push({ severity: 'P0', kind: 'package-manager-artifact', path: forbidden, detail: 'forbidden package-manager lockfile present' });
}

const report = {
  generatedAt: new Date().toISOString(),
  workspaceCount: workspaces.length,
  workflowCount: workflowFiles.length,
  findings,
  workspaces,
};

const reportPath = join(root, 'docs/audits/repository-deep-audit.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Repository deep audit: ${workspaces.length} workspaces, ${workflowFiles.length} workflows, ${findings.length} finding(s).`);
for (const finding of findings) console.log(`[${finding.severity}] ${finding.kind} ${finding.path}: ${finding.detail}`);

if (findings.some((finding) => finding.severity === 'P0')) process.exit(1);
