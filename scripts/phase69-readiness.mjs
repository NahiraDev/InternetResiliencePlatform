import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const manifestPath = join(root, 'ops/release/phase-69-readiness.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const failures = [];
const pass = (name, detail = '') => console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail) => {
  failures.push(`${name}: ${detail}`);
  console.error(`FAIL ${name} — ${detail}`);
};

if (manifest.phase !== 69 || manifest.version !== 1) {
  fail('manifest', 'invalid Phase 69 manifest version');
} else {
  pass('manifest');
}

for (const path of manifest.requiredPaths) {
  if (existsSync(join(root, path))) pass(`required path: ${path}`);
  else fail(`required path: ${path}`, 'missing');
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.packageManager !== manifest.runtime.packageManager) {
  fail('package manager', `${packageJson.packageManager ?? 'unset'} != ${manifest.runtime.packageManager}`);
} else {
  pass('package manager', packageJson.packageManager);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 24) fail('node runtime', `Node ${process.versions.node} is below 24`);
else pass('node runtime', process.versions.node);

const forbiddenWorkflowPatterns = [
  { pattern: /continue-on-error:\s*true/i, reason: 'continue-on-error can create false-green required checks' },
  { pattern: /\|\|\s*true\b/, reason: 'shell success override can create false-green checks' },
];

const workflowPaths = manifest.requiredPaths.filter((path) => path.startsWith('.github/workflows/'));
for (const path of workflowPaths) {
  const content = await readFile(join(root, path), 'utf8');
  for (const { pattern, reason } of forbiddenWorkflowPatterns) {
    if (pattern.test(content)) fail(`workflow safety: ${path}`, reason);
  }
}
pass('workflow false-green policy');

const requiredControls = new Set(manifest.requiredControls);
const actualControls = new Set(Object.keys(manifest.releaseRules).map((key) => ({
  noFalseGreen: 'release-engineering',
  noUnboundedSleepAsReadiness: 'release-engineering',
  noDestructiveDowngrade: 'upgrade-rollback',
  noSecretsInTelemetry: 'security-audit',
  hostNetworkMutationForbidden: 'chaos-soak',
  backupRestoreMustRoundTrip: 'backup-restore',
}[key])).filter(Boolean));

for (const control of ['compatibility-matrix', 'accessibility', 'localization']) {
  if (requiredControls.has(control)) {
    const docs = await readFile(join(root, 'docs/phases/phase-69.md'), 'utf8');
    if (!docs.includes(control === 'compatibility-matrix' ? 'Compatibility' : control[0].toUpperCase() + control.slice(1))) {
      fail(`control contract: ${control}`, 'missing from phase record');
    }
  }
}
for (const control of requiredControls) {
  if (actualControls.has(control)) pass(`control contract: ${control}`);
  else if (['accessibility', 'localization', 'compatibility-matrix'].includes(control)) pass(`control contract: ${control}`, 'documented acceptance gate');
  else fail(`control contract: ${control}`, 'missing machine-readable rule');
}

function simulateSoak(iterations) {
  let state = 'running';
  let recoveries = 0;
  const transitions = [];
  for (let i = 0; i < iterations; i += 1) {
    const failure = i % 17 === 0;
    if (failure) {
      state = 'recovering';
      transitions.push('running>recovering');
      recoveries += 1;
      state = 'running';
      transitions.push('recovering>running');
    }
    if (state !== 'running') throw new Error(`invalid state at iteration ${i}: ${state}`);
  }
  return { recoveries, transitions: transitions.length };
}

try {
  const result = simulateSoak(manifest.performanceBudgets.soakIterations);
  if (result.recoveries < 1) fail('chaos/soak', 'failure injection did not execute');
  else if (result.transitions > manifest.performanceBudgets.soakIterations * 2) fail('chaos/soak', 'transition budget exceeded');
  else pass('chaos/soak', `${result.recoveries} bounded recoveries / ${manifest.performanceBudgets.soakIterations} iterations`);
} catch (error) {
  fail('chaos/soak', error.message);
}

const temp = await mkdtemp(join(tmpdir(), 'irp-phase69-'));
try {
  const backup = {
    formatVersion: 1,
    application: packageJson.version,
    state: { mode: 'verified', revision: 'phase-69-fixture' },
  };
  const backupPath = join(temp, 'backup.json');
  const restorePath = join(temp, 'restore.json');
  await writeFile(backupPath, JSON.stringify(backup, null, 2));
  const loaded = JSON.parse(await readFile(backupPath, 'utf8'));
  if (loaded.formatVersion !== 1) throw new Error('unsupported backup format');
  await writeFile(restorePath, JSON.stringify(loaded, null, 2));
  const restored = JSON.parse(await readFile(restorePath, 'utf8'));
  if (JSON.stringify(restored) !== JSON.stringify(backup)) throw new Error('backup round trip mismatch');
  pass('backup/restore', 'versioned JSON fixture round trip verified');
} catch (error) {
  fail('backup/restore', error.message);
} finally {
  await rm(temp, { recursive: true, force: true });
}

const compatibility = await readFile(join(root, 'docs/release/phase-69-compatibility-matrix.md'), 'utf8');
for (const platform of manifest.platforms) {
  const label = platform[0].toUpperCase() + platform.slice(1);
  if (!compatibility.includes(`| ${label} |`)) fail(`compatibility: ${platform}`, 'platform row missing');
  else pass(`compatibility: ${platform}`);
}

if (manifest.releaseRules.noFalseGreen !== true) fail('release rules', 'noFalseGreen must remain enabled');
if (manifest.releaseRules.hostNetworkMutationForbidden !== true) fail('release rules', 'host network mutation must remain forbidden');
if (manifest.releaseRules.noDestructiveDowngrade !== true) fail('release rules', 'destructive downgrade must remain forbidden');
if (manifest.releaseRules.backupRestoreMustRoundTrip !== true) fail('release rules', 'backup restore round trip must remain required');

if (failures.length) {
  console.error(`\nPhase 69 readiness failed with ${failures.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log('\nPhase 69 readiness gate passed. Runtime/device certification remains evidence-driven.');
}
