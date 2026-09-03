import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const contractPath = join(root, 'ops/release/production-assurance.json');
const outputDir = join(root, process.env.IRP_ASSURANCE_OUTPUT ?? 'artifacts/production-assurance');
const contract = JSON.parse(await readFile(contractPath, 'utf8'));
const checks = [];
const failures = [];

const record = (id, status, detail, evidence = {}) => {
  checks.push({ id, status, detail, ...evidence });
  if (status === 'fail') failures.push(`${id}: ${detail}`);
  console.log(`${status.toUpperCase()} ${id} — ${detail}`);
};

const run = (command, args) => new Promise((resolve) => {
  const child = spawn(command, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error instanceof Error ? error.message : String(error)}` }));
  child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
});

async function sha256File(path) {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

async function hashDirectory(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  }
  await walk(directory);
  files.sort();
  const digest = createHash('sha256');
  for (const path of files) {
    digest.update(relative(directory, path));
    digest.update(await readFile(path));
  }
  return { sha256: digest.digest('hex'), files: files.length };
}

const startedAt = new Date().toISOString();
record('contract', 'pass', `schemaVersion=${contract.schemaVersion}`);

const build = await run('pnpm', ['--filter', '@irp/resilience-runtime', 'build']);
record('runtime-build', build.code === 0 ? 'pass' : 'fail', build.code === 0 ? 'canonical runtime package built successfully' : `build failed with exit ${build.code}`, { exitCode: build.code });

const integration = await run('pnpm', ['runtime:integration:strict']);
record('package-integration', integration.code === 0 ? 'pass' : 'fail', integration.code === 0 ? 'all discovered package integrations passed' : `package integration failed with exit ${integration.code}`, { exitCode: integration.code });

let validation = null;
const runtimeModule = join(root, 'packages/resilience-runtime/dist/e2e-validation.js');
if (existsSync(runtimeModule) && build.code === 0) {
  try {
    const { runPhase40Validation } = await import(`${runtimeModule}?assurance=${Date.now()}`);
    validation = await runPhase40Validation();
    const scenarioNames = new Set(validation.scenarios.map((scenario) => scenario.name));
    const missingScenarios = contract.requiredScenarios.filter((name) => !scenarioNames.has(name));
    const missingStages = contract.canonicalStages.filter((stage) => !validation.scenarios.some((scenario) => scenario.stages.includes(stage)));
    const missingAcceptance = contract.requiredAcceptance.filter((criterion) => validation.acceptance[criterion] !== true);
    if (missingScenarios.length) record('canonical-runtime-validation', 'fail', `missing required scenarios: ${missingScenarios.join(', ')}`);
    else if (missingStages.length) record('canonical-runtime-validation', 'fail', `missing canonical stages: ${missingStages.join(', ')}`);
    else if (missingAcceptance.length) record('canonical-runtime-validation', 'fail', `failed acceptance criteria: ${missingAcceptance.join(', ')}`);
    else if (validation.status !== 'passed') record('canonical-runtime-validation', 'fail', `runtime validation returned ${validation.status}`);
    else record('canonical-runtime-validation', 'pass', 'canonical runtime closed-loop scenarios passed', { validation });
  } catch (error) {
    record('canonical-runtime-validation', 'fail', error instanceof Error ? error.message : String(error));
  }
} else {
  record('canonical-runtime-validation', 'fail', 'canonical runtime validation module is unavailable after build');
}

let artifact = null;
const distDir = join(root, 'packages/resilience-runtime/dist');
if (existsSync(distDir)) {
  artifact = await hashDirectory(distDir);
  record('runtime-artifact-integrity', 'pass', `hashed ${artifact.files} runtime artifact files`, artifact);
} else {
  record('runtime-artifact-integrity', 'fail', 'runtime dist directory is missing');
}

const verdict = failures.length ? 'FAIL' : 'PASS';
const finishedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  verdict,
  generatedAt: finishedAt,
  startedAt,
  commitSha: process.env.GITHUB_SHA ?? 'unknown',
  contractSha256: createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
  checks,
  artifact,
  validation,
  productionCertificationBoundary: 'This assurance report proves executable repository/runtime integration only. It does not claim real regional, device, backup/restore, upgrade/rollback, chaos/soak, or production infrastructure evidence.'
};

await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'assurance-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(join(outputDir, 'assurance-report.sha256'), `${await sha256File(join(outputDir, 'assurance-report.json'))}  assurance-report.json\n`, 'utf8');

console.log(`\nSYSTEM ASSURANCE: ${verdict}`);
console.log(`Report: ${join(outputDir, 'assurance-report.json')}`);
if (verdict !== 'PASS') process.exitCode = 1;
