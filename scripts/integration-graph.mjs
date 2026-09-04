import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outDir = join(root, 'artifacts/integration-baseline');
const registryPath = join(root, 'ops/release/real-environment/ASSURANCE_REGISTRY.json');
const packageRoots = ['packages', 'apps'];
const workspace = new Map();

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function collect(rootDir) {
  const absolute = join(root, rootDir);
  if (!existsSync(absolute)) return;
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(absolute, entry.name, 'package.json');
    if (!existsSync(packagePath)) continue;
    const manifest = await readJson(packagePath);
    if (!manifest.name) continue;
    workspace.set(manifest.name, {
      name: manifest.name,
      path: relative(root, join(absolute, entry.name)),
      manifest,
    });
  }
}

for (const rootDir of packageRoots) await collect(rootDir);

const registry = existsSync(registryPath) ? await readJson(registryPath) : { capabilities: {} };
const capabilityByPath = new Map();
for (const [capability, value] of Object.entries(registry.capabilities ?? {})) {
  for (const evidenceId of value.evidenceIds ?? []) capabilityByPath.set(evidenceId, capability);
}

const nodes = [...workspace.values()].map((item) => {
  const scripts = item.manifest.scripts ?? {};
  const hasBuild = Boolean(scripts.build);
  const hasTest = Boolean(scripts.test);
  const hasStart = Boolean(scripts.start || scripts.dev);
  const executable = hasBuild || hasTest || hasStart || Boolean(item.manifest.bin);
  return {
    id: item.name,
    path: item.path,
    executable,
    entrypoint: item.manifest.main ?? item.manifest.bin ?? null,
    scripts: Object.keys(scripts).sort(),
    status: executable ? 'CONNECTED_BUT_UNVERIFIED' : 'ORPHANED',
    realEnvironment: 'BLOCKED',
  };
});

const edges = [];
for (const item of workspace.values()) {
  const deps = {
    ...(item.manifest.dependencies ?? {}),
    ...(item.manifest.optionalDependencies ?? {}),
    ...(item.manifest.peerDependencies ?? {}),
  };
  for (const [target, version] of Object.entries(deps)) {
    if (!String(version).startsWith('workspace:') || !workspace.has(target)) continue;
    edges.push({
      source: item.name,
      target,
      contract: 'workspace dependency',
      transport: 'node module import/link',
      status: 'CONNECTED_BUT_UNVERIFIED',
      failureBehavior: 'dependency/build/runtime failure must fail the invoking surface',
      verification: 'deterministic build plus runtime integration; real runtime evidence required for VERIFIED',
    });
  }
}

const stages = ['observe', 'measure', 'detect', 'diagnose', 'decide', 'policy', 'apply', 'verify', 'recover', 'telemetry'];
const failureMatrix = [
  ['dependency unavailable', 'consumer fails closed; no mutation without a valid dependency'],
  ['measurement degraded', 'decision remains policy-constrained and must not claim healthy state'],
  ['apply failure', 'verification must fail and recovery/failover must be attempted'],
  ['verification failure', 'rollback/recovery path must execute and emit evidence'],
  ['telemetry unavailable', 'operation may continue only according to explicit local safety policy; certification remains blocked'],
];

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? process.env.GIT_COMMIT ?? 'unknown',
  nodes,
  edges,
  closedLoop: {
    stages,
    status: 'DETERMINISTIC_BASELINE_REQUIRED',
    realEnvironmentStatus: 'BLOCKED',
  },
  executionMatrix: nodes.map((node) => ({
    componentId: node.id,
    build: node.scripts.includes('build') ? 'DECLARED' : 'MISSING',
    test: node.scripts.includes('test') ? 'DECLARED' : 'MISSING',
    entrypoint: node.entrypoint,
    runtimeExecution: 'UNVERIFIED',
  })),
  failureMatrix,
  realEnvironment: Object.entries(registry.capabilities ?? {}).map(([capability, value]) => ({
    capability,
    environment: value.environment,
    evidenceIds: value.evidenceIds,
    status: 'BLOCKED_UNTIL_OBSERVED',
  })),
};

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'integration-graph.json'), `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  '# Integration Baseline Matrix',
  '',
  `Generated: ${report.generatedAt}`,
  `Commit: ${report.commit}`,
  '',
  '## Component status',
  '',
  '| Component | Executable | Deterministic status | Real environment |',
  '|---|---:|---|---|',
  ...nodes.map((n) => `| ${n.id} | ${n.executable ? 'yes' : 'no'} | ${n.status} | ${n.realEnvironment} |`),
  '',
  '## Integration edges',
  '',
  '| Source | Target | Contract | Transport | Status |',
  '|---|---|---|---|---|',
  ...edges.map((e) => `| ${e.source} | ${e.target} | ${e.contract} | ${e.transport} | ${e.status} |`),
  '',
  '## Closed loop',
  '',
  `\`${stages.join(' -> ')}\``,
  '',
  'The graph is a connectivity inventory, not production evidence. An edge is not VERIFIED merely because a workspace dependency exists.',
  '',
  '## Failure matrix',
  '',
  '| Fault | Required behavior |',
  '|---|---|',
  ...failureMatrix.map(([fault, behavior]) => `| ${fault} | ${behavior} |`),
  '',
  '## Real-environment boundary',
  '',
  'All registered capabilities remain BLOCKED until independently observed evidence is bound to the tested commit and artifact.',
  '',
].join('\n');
await writeFile(join(outDir, 'integration-matrix.md'), markdown);

console.log(`Integration graph: ${nodes.length} components, ${edges.length} workspace edges`);
console.log(`Closed-loop stages: ${stages.length}`);
console.log(`Real-environment capabilities: ${report.realEnvironment.length} (all fail-closed until evidence)`);
console.log(`Wrote ${relative(root, outDir)}/integration-graph.json and integration-matrix.md`);
