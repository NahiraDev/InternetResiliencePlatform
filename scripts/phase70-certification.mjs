import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(join(root, 'ops/release/phase-70-certification.json'), 'utf8'));
const failures = [];
const pass = (name, detail = '') => console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail) => {
  failures.push(`${name}: ${detail}`);
  console.error(`FAIL ${name} — ${detail}`);
};

if (manifest.phase !== 70 || manifest.version !== 1) fail('manifest', 'invalid Phase 70 manifest version');
else pass('manifest');

for (const path of manifest.requiredPaths) {
  if (existsSync(join(root, path))) pass(`required path: ${path}`);
  else fail(`required path: ${path}`, 'missing');
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.packageManager !== manifest.runtime.packageManager) fail('package manager', `${packageJson.packageManager ?? 'unset'} != ${manifest.runtime.packageManager}`);
else pass('package manager', packageJson.packageManager);

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 24) fail('node runtime', `Node ${process.versions.node} is below 24`);
else pass('node runtime', process.versions.node);

const workflowFiles = manifest.requiredPaths.filter((path) => path.startsWith('.github/workflows/'));
for (const path of workflowFiles) {
  const content = await readFile(join(root, path), 'utf8');
  // GitHub expressions are configuration, not shell success overrides. Strip
  // expression bodies before checking for the unsafe `|| true` shell pattern.
  const workflowContent = content.replace(/\$\{\{[\s\S]*?\}\}/g, '');
  if (/continue-on-error:\s*true/i.test(workflowContent) || /\|\|\s*true\b/.test(workflowContent)) {
    fail(`workflow safety: ${path}`, 'false-green success override detected');
  }
}
pass('workflow false-green policy');

const phase69 = await readFile(join(root, 'docs/phases/phase-69.md'), 'utf8');
for (const marker of ['compatibility', 'accessibility', 'localization', 'rollback', 'security']) {
  if (phase69.toLocaleLowerCase().includes(marker)) pass(`phase-69 prerequisite: ${marker}`);
  else fail(`phase-69 prerequisite: ${marker}`, 'missing from phase record');
}

const forbiddenEvidencePatterns = [/BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY/i, /(?:password|secret|token|api[_-]?key)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}/i];
for (const path of ['PROJECT_STATE.md', 'docs/phases/phase-69.md', 'docs/release/phase-69-compatibility-matrix.md']) {
  const content = await readFile(join(root, path), 'utf8');
  for (const pattern of forbiddenEvidencePatterns) {
    if (pattern.test(content)) fail(`evidence safety: ${path}`, 'possible secret material detected');
  }
}
pass('evidence secret-scan');

const requiredEvidence = new Set(manifest.requiredEvidence);
const staticEvidence = new Set(['repository-gates', 'phase-69-readiness']);
for (const item of requiredEvidence) {
  if (staticEvidence.has(item)) pass(`evidence contract: ${item}`, 'available from repository gates');
  else console.log(`PENDING ${item} — requires signed/runtime/device evidence`);
}

const compatibility = await readFile(join(root, 'docs/release/phase-69-compatibility-matrix.md'), 'utf8');
for (const platform of manifest.platforms.filter((p) => ['linux', 'macos', 'windows', 'ios', 'android'].includes(p))) {
  const row = compatibility.split('\n').some((line) => /^\|\s*[^|]+\s*\|/.test(line) && line.split('|')[1].trim().toLocaleLowerCase() === platform);
  if (row) pass(`compatibility prerequisite: ${platform}`);
  else fail(`compatibility prerequisite: ${platform}`, 'platform row missing');
}

for (const [rule, expected] of Object.entries(manifest.releaseRules)) {
  if (expected !== true) fail(`release rule: ${rule}`, 'must remain enabled');
}
pass('release rules');

if (failures.length) {
  console.error(`\nPhase 70 certification contract failed with ${failures.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log('\nPhase 70 certification contract passed. Production certification remains blocked until all PENDING evidence is supplied and reviewed.');
}
