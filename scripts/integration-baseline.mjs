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

async function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile() && path.endsWith('.js')) files.push(path);
  }
  return files;
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
    if (!String(version).startsWith('workspace:')) continue;
    if (!workspacePackages.has(dependency)) failures.push(`${name}: unresolved workspace dependency ${dependency}`);
  }
}

for (const [source, target] of contract.requiredEdges) {
  const sourcePackage = workspacePackages.get(source);
  const targetPackage = workspacePackages.get(target);
  if (!sourcePackage) {
    failures.push(`required source package missing: ${source}`);
    continue;
  }
  if (!targetPackage) {
    failures.push(`required target package missing: ${target}`);
    continue;
  }
  const deps = {
    ...(sourcePackage.manifest.dependencies ?? {}),
    ...(sourcePackage.manifest.optionalDependencies ?? {}),
  };
  if (!Object.hasOwn(deps, target)) failures.push(`required integration edge missing from manifest: ${source} -> ${target}`);
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

async function verifyCompiledEdges() {
  for (const [source, target] of contract.requiredEdges) {
    const sourcePackage = workspacePackages.get(source);
    const targetPackage = workspacePackages.get(target);
    if (!sourcePackage || !targetPackage) continue;
    const sourceDist = join(root, sourcePackage.path, 'dist');
    const targetDist = join(root, targetPackage.path, 'dist');
    if (!existsSync(sourceDist)) {
      failures.push(`compiled source missing for required edge: ${source}`);
      continue;
    }
    if (!existsSync(targetDist)) {
      failures.push(`compiled target missing for required edge: ${target}`);
      continue;
    }
    const files = await collectFiles(sourceDist);
    let referenced = false;
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      if (content.includes(`from '${target}'`) || content.includes(`from \"${target}\"`) || content.includes(`'${target}/`) || content.includes(`\"${target}/`)) {
        referenced = true;
        break;
      }
    }
    if (!referenced) failures.push(`required compiled integration edge is not referenced by emitted code: ${source} -> ${target}`);
  }
}

if (!failures.length) {
  await run('pnpm', ['integration:graph']);

  const graphPath = join(root, 'artifacts/integration-baseline/integration-graph.json');
  if (!existsSync(graphPath)) {
    failures.push('integration graph artifact was not generated');
  } else {
    const graph = await readJson(graphPath);
    const edgeKeys = new Set(graph.edges.map((edge) => `${edge.source}->${edge.target}`));
    for (const [source, target] of contract.requiredEdges) {
      if (!edgeKeys.has(`${source}->${target}`)) failures.push(`required edge absent from generated graph: ${source} -> ${target}`);
    }
    if (graph.nodes.length !== workspacePackages.size) {
      failures.push(`integration graph inventory mismatch: graph=${graph.nodes.length}, workspace=${workspacePackages.size}`);
    }
  }

  if (!failures.length && process.env.IRP_INTEGRATION_SKIP_BUILD !== '1') await run('pnpm', ['build']);
  if (!failures.length) await run('pnpm', ['runtime:integration:strict']);
  if (!failures.length) await verifyCompiledEdges();
  if (!failures.length) {
    const e2ePath = join(root, 'packages/resilience-runtime/dist/e2e-validation.js');
    if (!existsSync(e2ePath)) failures.push('canonical runtime E2E validation artifact is missing after build');
    else {
      const result = await import(`file://${e2ePath}`);
      const report = await result.runPhase40Validation();
      for (const stage of contract.requiredClosedLoopStages.filter((stage) => stage !== 'telemetry')) {
        const covered = report.scenarios.some((scenario) => scenario.stages.includes(stage));
        if (!covered) failures.push(`closed-loop stage is not covered by deterministic runtime validation: ${stage}`);
      }
      if (report.status !== 'passed') failures.push(`canonical runtime validation failed: ${report.failedCriteria.join(', ')}`);
    }
  }
}

console.log(`INTEGRATION BASELINE: ${failures.length ? 'BLOCKED' : 'PASS'}`);
console.log(`Workspace packages/apps: ${workspacePackages.size}`);
console.log(`Required integration edges: ${contract.requiredEdges.length}`);
console.log(`Compiled required edges checked: ${failures.length ? 'see failures' : contract.requiredEdges.length}`);
console.log(`Closed-loop execution stages checked: ${contract.requiredClosedLoopStages.length - 1}`);
console.log('Integration graph is repository-derived; real-environment and production evidence remain separate fail-closed gates.');

if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
