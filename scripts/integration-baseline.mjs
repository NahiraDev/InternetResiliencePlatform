import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const contract = JSON.parse(await readFile(join(root, 'ops/release/integration-baseline.json'), 'utf8'));
const failures = [];
const workspacePackages = new Map();

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function collectPackages(dir) {
  if (!existsSync(dir)) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageJson = join(dir, entry.name, 'package.json');
    if (existsSync(packageJson)) {
      const manifest = await readJson(packageJson);
      if (manifest.name) workspacePackages.set(manifest.name, { path: relative(root, join(dir, entry.name)), manifest });
    }
  }
}

await collectPackages(join(root, 'packages'));
await collectPackages(join(root, 'apps'));

for (const [name, item] of workspacePackages) {
  const deps = {
    ...(item.manifest.dependencies ?? {}),
    ...(item.manifest.optionalDependencies ?? {}),
    ...(item.manifest.devDependencies ?? {}),
    ...(item.manifest.peerDependencies ?? {}),
  };
  for (const [dependency, version] of Object.entries(deps)) {
    if (version !== 'workspace:*' && version !== 'workspace:^' && version !== 'workspace:~' && !version.startsWith('workspace:')) continue;
    if (!workspacePackages.has(dependency)) failures.push(`${name}: unresolved workspace dependency ${dependency}`);
  }
}

const requiredEdges = contract.requiredEdges.map(([source, target]) => `${source} -> ${target}`);
for (const [source, target] of contract.requiredEdges) {
  const sourcePackage = workspacePackages.get(source);
  if (!sourcePackage) {
    failures.push(`required source package missing: ${source}`);
    continue;
  }
  const deps = {
    ...(sourcePackage.manifest.dependencies ?? {}),
    ...(sourcePackage.manifest.optionalDependencies ?? {}),
  };
  if (!Object.hasOwn(deps, target)) failures.push(`required integration edge missing: ${source} -> ${target}`);
}

if (!workspacePackages.has(contract.rules.canonicalRuntime)) failures.push(`canonical runtime missing: ${contract.rules.canonicalRuntime}`);

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env });
    child.on('error', (error) => {
      failures.push(`${command} ${args.join(' ')} could not start: ${error.message}`);
      resolve(1);
    });
    child.on('exit', (code, signal) => {
      if (code !== 0) failures.push(`${command} ${args.join(' ')} exited with ${signal ?? code}`);
      resolve(code ?? 1);
    });
  });
}

if (!failures.length) {
  await run('pnpm', ['runtime:integration:strict']);
  if (!failures.length) {
    const e2ePath = join(root, 'packages/resilience-runtime/dist/e2e-validation.js');
    if (!existsSync(e2ePath)) failures.push('canonical runtime E2E validation artifact is missing; run the full build first');
    else {
      const result = await import(`file://${e2ePath}`);
      const report = await result.runPhase40Validation();
      for (const stage of contract.requiredClosedLoopStages) {
        const covered = report.scenarios.some((scenario) => stage === 'telemetry' ? false : scenario.stages.includes(stage));
        if (!covered) failures.push(`closed-loop stage is not covered by deterministic runtime validation: ${stage}`);
      }
      if (report.status !== 'passed') failures.push(`canonical runtime validation failed: ${report.failedCriteria.join(', ')}`);
    }
  }
}

console.log(`INTEGRATION BASELINE: ${failures.length ? 'BLOCKED' : 'PASS'}`);
console.log(`Workspace packages/apps: ${workspacePackages.size}`);
console.log(`Required integration edges: ${requiredEdges.length}`);
console.log(`Closed-loop stages required: ${contract.requiredClosedLoopStages.length}`);
console.log('Real-environment production evidence remains a separate fail-closed gate.');

if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
