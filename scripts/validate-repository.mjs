#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const skip = new Set(['.git', 'node_modules', 'dist', '.turbo', 'coverage']);
const files = [];
const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { if (skip.has(entry.name)) continue; const full = join(dir, entry.name); if (entry.isDirectory()) walk(full); else files.push(full); } };
const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { errors.push(`${relative(root, file)} is invalid JSON: ${error.message}`); return undefined; } };
walk(root);
for (const file of files) {
  const rel = relative(root, file);
  const text = readFileSync(file, 'utf8');
  if (text.includes('<'.repeat(7)) || text.includes('>'.repeat(7)) || text.includes('='.repeat(7))) errors.push(`${rel} contains merge-conflict markers`);
  if (rel.endsWith('.json')) readJson(file);
}
const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
for (const expected of ['apps/*', 'packages/*']) if (!workspace.includes(expected)) errors.push(`pnpm-workspace.yaml missing ${expected}`);
const packages = files.filter((f) => relative(root, f).match(/^(apps|packages)\/[^/]+\/package\.json$/));
const names = new Map();
for (const file of packages) {
  const pkg = readJson(file); if (!pkg) continue;
  const rel = relative(root, file);
  if (!pkg.name) errors.push(`${rel} missing package name`);
  if (names.has(pkg.name)) errors.push(`duplicate package name ${pkg.name}: ${names.get(pkg.name)} and ${rel}`);
  names.set(pkg.name, rel);
  for (const script of ['build','lint','test','typecheck']) if (!pkg.scripts?.[script]) errors.push(`${rel} missing ${script} script`);
  for (const section of ['dependencies','devDependencies','peerDependencies']) for (const dep of Object.keys(pkg[section] ?? {})) if (dep.startsWith('@irp/') && !names.has(dep) && !packages.some((p) => readJson(p)?.name === dep)) errors.push(`${rel} references unknown workspace package ${dep}`);
}
const workflows = files.filter((f) => relative(root, f).startsWith('.github/workflows/') && /\.ya?ml$/.test(f));
const workflowNames = new Map();
for (const file of workflows) {
  const rel = relative(root, file); const text = readFileSync(file, 'utf8'); const match = text.match(/^name:\s*(.+)$/m);
  if (!match) errors.push(`${rel} missing workflow name`); else if (workflowNames.has(match[1])) errors.push(`duplicate workflow name ${match[1]}`); else workflowNames.set(match[1], rel);
  if (!text.includes('actions/checkout@v4')) errors.push(`${rel} missing checkout@v4`);
  if (!text.includes('actions/setup-node@v4')) errors.push(`${rel} missing setup-node@v4`);
  if (!text.includes('pnpm/action-setup@v4')) errors.push(`${rel} missing pnpm/action-setup@v4`);
}
for (const required of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','turbo.json','tsconfig.base.json']) if (!statSync(join(root, required), { throwIfNoEntry: false })) errors.push(`missing ${required}`);
const turbo = spawnSync('pnpm', ['exec', 'turbo', 'run', 'build', '--dry=json'], { cwd: root, encoding: 'utf8' });
if (turbo.status !== 0) errors.push(`turbo graph validation failed: ${turbo.stderr || turbo.stdout}`);
if (errors.length) { console.error(`Repository validation failed with ${errors.length} issue(s):`); for (const error of errors) console.error(`- ${error}`); process.exit(1); }
console.log(`Repository validation passed for ${packages.length} packages, ${workflows.length} workflows, and ${files.length} files.`);
