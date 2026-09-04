import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const contract = JSON.parse(await readFile(join(root, 'ops/release/full-system-assurance.json'), 'utf8'));
const registry = JSON.parse(await readFile(join(root, contract.realEnvironmentAdapterRegistry), 'utf8'));
const outputDir = join(root, process.env.IRP_FULL_SYSTEM_OUTPUT ?? 'artifacts/full-system-assurance');
const rows = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build', '.turbo'].includes(entry.name)) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function capabilityFor(id) {
  const value = id.toLowerCase();
  const rules = [
    ['resilience-runtime', 'resilience-runtime'], ['network-intelligence', 'network-intelligence'], ['connectivity', 'connectivity'],
    ['dns', 'dns'], ['gateway-registry', 'gateway-registry'], ['routing', 'routing'], ['failover', 'failover'],
    ['ios-network-extension', 'ios-network-extension'], ['ios/packettunnel', 'ios-network-extension'], ['packettunnel', 'ios-network-extension'],
    ['tunnel', 'tunnel'], ['database', 'database'], ['api', 'api'], ['daemon', 'daemon'], ['security', 'security'],
    ['telemetry', 'telemetry'], ['linux-client', 'linux-client'], ['macos-client', 'macos-client'], ['windows-client', 'windows-client'],
    ['android', 'android-client'], ['ios', 'ios-client'], ['observability', 'observability'], ['docker', 'docker'],
    ['kubernetes', 'kubernetes'], ['regional', 'regional-validation'], ['release', 'release-engineering'], ['backup', 'backup-restore'],
    ['rollback', 'upgrade-rollback'], ['chaos', 'chaos-soak'], ['control-plane', 'control-plane'], ['control', 'control-plane'], ['cli', 'control-plane']
  ];
  if (value.includes('infra') || value.includes('docker')) return 'docker';
  if (value.includes('k8s') || value.includes('kubernetes')) return 'kubernetes';
  if (value.includes('ops/observability') || value.includes('observability')) return 'observability';
  if (value.includes('ops/release') || value.includes('release')) return 'release-engineering';
  if (value.includes('regional')) return 'regional-validation';
  if (value.includes('backup')) return 'backup-restore';
  if (value.includes('rollback')) return 'upgrade-rollback';
  if (value.includes('chaos') || value.includes('soak')) return 'chaos-soak';
  return rules.find(([needle]) => value.includes(needle))?.[1] ?? 'other';
}

function executableEntrypoint(abs, manifest) {
  const scripts = manifest?.scripts ?? {};
  if (scripts.start) return `pnpm --dir ${relative(root, abs)} start`;
  if (manifest?.bin) return `package.bin:${typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin)[0]}`;
  return null;
}

function requiresRealEnvironment(type, capability) {
  if (type === 'workflow') return false;
  if (type === 'roadmap-phase') return false;
  if (type === 'assurance-surface') return true;
  return Boolean(capability);
}

function realEnvironmentContract(capability) {
  const entry = registry.capabilities?.[capability];
  if (!entry) return { status: 'BLOCKED', assurancePath: null, evidenceIds: [], environment: null, failureInjection: null, recoveryVerification: null, telemetryEvidence: null, reason: 'No registered real-environment assurance contract' };
  return {
    status: 'PENDING', assurancePath: contract.realEnvironmentAdapterRegistry, evidenceIds: entry.evidenceIds ?? [], environment: entry.environment ?? null,
    failureInjection: 'Required by evidence schema; adapter must record the injected degradation/failure.',
    recoveryVerification: 'Required by evidence schema; adapter must verify recovery on the real path.',
    telemetryEvidence: 'Required by evidence schema; adapter must provide traceId and observed telemetry.'
  };
}

async function addSurface(path, type, packageJson = null) {
  const abs = join(root, path);
  const isDir = existsSync(abs) && statSync(abs).isDirectory();
  const files = isDir ? await walk(abs) : [abs];
  const sourceFiles = files.filter((file) => /\.(ts|tsx|js|mjs|cjs|swift|kt|kts|sh|sql)$/.test(file)).length;
  const entrypoint = executableEntrypoint(abs, packageJson);
  const executable = Boolean(entrypoint) || ['app', 'android-client', 'ios-client', 'ios-network-extension', 'operations', 'infrastructure'].includes(type);
  const capability = capabilityFor(path);
  const evidenceRequired = executable && requiresRealEnvironment(type, capability);
  rows.push({
    componentId: path.replaceAll('/', '::'), path, type, capability, executable, entrypoint,
    buildCommand: packageJson?.scripts?.build ?? null, testCommand: packageJson?.scripts?.test ?? null, sourceFiles,
    upstreamDependencies: packageJson ? Object.keys({ ...(packageJson.dependencies ?? {}), ...(packageJson.optionalDependencies ?? {}) }) : [],
    downstreamDependencies: [], owningPhases: [],
    realEnvironment: evidenceRequired
      ? { ...realEnvironmentContract(capability), evidenceRequired: true }
      : { status: 'NOT_APPLICABLE', evidenceRequired: false },
    evidenceId: null
  });
}

for (const top of ['packages', 'apps']) {
  if (!existsSync(join(root, top))) continue;
  for (const entry of await readdir(join(root, top), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = `${top}/${entry.name}`;
    const manifest = join(root, path, 'package.json');
    await addSurface(path, top === 'apps' ? 'app' : 'package', existsSync(manifest) ? await readJson(manifest) : null);
  }
}
for (const path of ['clients/android', 'clients/ios', 'clients/ios/PacketTunnel']) {
  if (existsSync(join(root, path))) await addSurface(path, path.includes('PacketTunnel') ? 'ios-network-extension' : path.includes('android') ? 'android-client' : 'ios-client');
}
for (const top of ['infra', 'ops']) {
  const base = join(root, top);
  if (!existsSync(base)) continue;
  for (const entry of await readdir(base, { withFileTypes: true })) await addSurface(`${top}/${entry.name}`, entry.isDirectory() ? 'operations' : 'infrastructure');
}
const workflowDir = join(root, '.github/workflows');
if (existsSync(workflowDir)) for (const file of await readdir(workflowDir)) if (/\.(yml|yaml)$/.test(file)) await addSurface(`.github/workflows/${file}`, 'workflow');

const packageRows = rows.filter((row) => row.type === 'package' || row.type === 'app');
const reverse = new Map(packageRows.map((row) => [row.path.split('/').at(-1), new Set()]));
for (const row of packageRows) for (const dependency of row.upstreamDependencies) {
  const target = dependency.startsWith('@irp/') ? dependency.slice('@irp/'.length) : dependency;
  if (reverse.has(target)) reverse.get(target).add(row.path);
}
for (const row of packageRows) row.downstreamDependencies = [...(reverse.get(row.path.split('/').at(-1)) ?? [])].sort();

const phaseDocs = [];
const phaseDir = join(root, 'docs/phases');
if (existsSync(phaseDir)) for (const file of await readdir(phaseDir)) {
  const match = /^phase-(\d+)(?:-[^/]+)?\.md$/.exec(file);
  if (match) phaseDocs.push(Number(match[1]));
}

const phaseReadmePath = join(root, 'docs/phases/README.md');
const phasePolicyText = existsSync(phaseReadmePath) ? await readFile(phaseReadmePath, 'utf8') : '';
const canonicalPhaseRecords = [...phasePolicyText.matchAll(/\[`?phase-(\d+)\.md`?\]\(phase-\1\.md\)/g)].map((match) => Number(match[1]));
const canonicalPhaseSet = [...new Set(canonicalPhaseRecords)].sort((a, b) => a - b);
const missingCanonicalPhaseDocs = canonicalPhaseSet.filter((n) => !phaseDocs.includes(n));

for (let n = 0; n <= contract.roadmap.maxPhase; n++) rows.push({
  componentId: `roadmap::phase-${n}`, path: `docs/phases/phase-${String(n).padStart(2, '0')}.md`, type: 'roadmap-phase', capability: 'release-engineering', executable: false,
  entrypoint: null, buildCommand: null, testCommand: null, sourceFiles: 0, upstreamDependencies: [], downstreamDependencies: [], owningPhases: [n],
  realEnvironment: { status: canonicalPhaseSet.includes(n) ? (missingCanonicalPhaseDocs.includes(n) ? 'BLOCKED' : 'PENDING') : 'NOT_APPLICABLE', evidenceRequired: false }, evidenceId: null
});

for (const capability of contract.assuranceOnlyCapabilitySurfaces ?? []) {
  if (rows.some((row) => row.capability === capability)) continue;
  const evidence = realEnvironmentContract(capability);
  rows.push({
    componentId: `assurance::${capability}`, path: `ops/release/real-environment::${capability}`, type: 'assurance-surface', capability,
    executable: false, entrypoint: null, buildCommand: null, testCommand: null, sourceFiles: 0,
    upstreamDependencies: [], downstreamDependencies: [], owningPhases: [], realEnvironment: { ...evidence, evidenceRequired: true }, evidenceId: null
  });
}

const discoveredCapabilities = new Set(rows.map((row) => row.capability));
const missingCapabilities = contract.requiredCapabilitySurfaces.filter((capability) => !discoveredCapabilities.has(capability));
const noAssurance = rows.filter((row) => row.executable && row.realEnvironment.status === 'BLOCKED');
const blockedCanonicalPhaseDocs = rows.filter((row) => row.type === 'roadmap-phase' && row.realEnvironment.status === 'BLOCKED');
const report = {
  schemaVersion: 3, generatedAt: new Date().toISOString(), commitSha: process.env.GITHUB_SHA ?? 'unknown', repositoryScope: contract.sourceOfTruth,
  componentCount: rows.length, sourceFileCount: rows.reduce((n, row) => n + row.sourceFiles, 0), components: rows,
  roadmap: {
    expectedThrough: contract.roadmap.maxPhase,
    discoveredPhaseDocs: [...new Set(phaseDocs)].sort((a, b) => a - b),
    canonicalPhaseRecords: canonicalPhaseSet,
    missingCanonicalPhaseDocs,
    policy: 'Only phase records explicitly designated as current/canonical by docs/phases/README.md are required. Historical 01–38 and future unstarted phases are not mechanically required.'
  },
  requiredCapabilitySurfaces: contract.requiredCapabilitySurfaces,
  assuranceOnlyCapabilitySurfaces: contract.assuranceOnlyCapabilitySurfaces ?? [],
  missingCapabilitySurfaces: missingCapabilities,
  closedLoopStages: contract.requiredClosedLoopStages,
  verdict: missingCapabilities.length || noAssurance.length || missingCanonicalPhaseDocs.length ? 'BLOCKED' : 'PASS',
  failures: [],
  blocked: [
    ...missingCanonicalPhaseDocs.map((n) => `phase-${n}: canonical phase document is missing`),
    ...noAssurance.map((row) => `${row.path}: no registered real-environment assurance contract for capability ${row.capability}`),
    ...missingCapabilities.map((capability) => `${capability}: capability surface has no discovered repository owner or assurance-surface contract`)
  ],
  executableComponentsWithoutAssurance: noAssurance.length,
  registeredRealEnvironmentContracts: Object.keys(registry.capabilities ?? {}).length,
  realEnvironmentEvidenceSchema: contract.realEnvironmentEvidence,
  reportSha256: null
};
report.reportSha256 = hash(JSON.stringify({ ...report, reportSha256: null }));
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'system-matrix.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(join(outputDir, 'system-matrix.sha256'), `${hash(JSON.stringify(report))}  system-matrix.json\n`, 'utf8');
console.log(`FULL SYSTEM ASSURANCE MATRIX: ${report.verdict}`);
console.log(`Components/phases: ${report.componentCount}; source files represented: ${report.sourceFileCount}`);
console.log(`Missing canonical phase docs: ${missingCanonicalPhaseDocs.length}; executable surfaces without assurance: ${noAssurance.length}`);
console.log(`Registered real-environment capability contracts: ${report.registeredRealEnvironmentContracts}`);
if (report.verdict === 'BLOCKED') {
  console.error('Full-system assurance is BLOCKED; CI must not report success.');
  process.exitCode = 1;
}
