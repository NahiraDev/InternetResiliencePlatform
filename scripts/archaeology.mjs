#!/usr/bin/env node
/**
 * Repository archaeology, authority map and architecture drift engine
 * (issue #273, workstream tasks 1-9).
 *
 * Produces evidence-backed artifacts under artifacts/archaeology/:
 *   - inventory.json            task 1  full workspace inventory
 *   - runtime-paths.json        task 2  entrypoint -> mutation -> verification traces
 *   - capability-matrix.json    task 3  capability -> impl -> owner -> consumer -> path
 *   - authority-map.json        task 4  decision/mutation authority map
 *   - phase-audit.json          task 5  phase document audit
 *   - orphans.json              tasks 6/7 orphans, dead paths, duplicate contracts
 *   - drift-register.json       task 9  severity/evidence/impact/owner/fix/verification
 *
 * Every finding is linked to concrete source/test evidence. Exits non-zero on
 * CRITICAL drift so CI can gate on it (task 10).
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outDir = join(root, 'artifacts/archaeology');

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.turbo',
  'coverage',
  'artifacts',
  'build',
]);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const readText = async (path) => readFile(path, 'utf8');

async function walk(dir, filter, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, filter, acc);
    else if (filter(full)) acc.push(full);
  }
  return acc;
}

const isSource = (file) => SOURCE_EXT.test(file);
const isDoc = (file) => /\.mdx?$/.test(file);
const rel = (file) => relative(root, file).replaceAll('\\', '/');

// ---------------------------------------------------------------------------
// Task 1: inventory
// ---------------------------------------------------------------------------
async function buildInventory() {
  const packages = [];
  for (const group of ['packages', 'apps', 'clients']) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(base, entry.name, 'package.json');
      const native =
        existsSync(join(base, entry.name, 'build.gradle.kts')) ||
        existsSync(join(base, entry.name, 'Package.swift'));
      if (!existsSync(manifestPath) && !native) continue;
      const manifest = existsSync(manifestPath) ? await readJson(manifestPath) : {};
      const srcRoot = join(base, entry.name, 'src');
      const sources = existsSync(srcRoot) ? await walk(srcRoot, isSource) : [];
      const tests = (await walk(join(base, entry.name), isSource)).filter(
        (f) => /(^|\/)(test|tests|__tests__)\//.test(rel(f)) || /\.test\.|\.spec\./.test(f),
      );
      packages.push({
        group,
        name: manifest.name ?? `${group}/${entry.name}`,
        path: relative(root, join(base, entry.name)),
        kind: native && !manifest.name ? 'native-client' : 'workspace-package',
        scripts: Object.keys(manifest.scripts ?? {}).sort(),
        dependencies: Object.keys(manifest.dependencies ?? {}).sort(),
        sourceFiles: sources.length,
        testFiles: tests.length,
        hasTests: tests.length > 0,
      });
    }
  }

  const infra = {
    workflows: (await walk(join(root, '.github/workflows'), (f) => /\.ya?ml$/.test(f))).map(rel),
    scripts: (await walk(join(root, 'scripts'), isSource)).map(rel),
    tools: existsSync(join(root, 'tools'))
      ? (await walk(join(root, 'tools'), (f) => !/\.(md|png|svg)$/.test(f))).map(rel)
      : [],
    ops: existsSync(join(root, 'ops'))
      ? (await walk(join(root, 'ops'), (f) => /\.(ya?ml|json|sh|mjs|cjs)$/.test(f))).map(rel)
      : [],
    config: existsSync(join(root, 'config')) ? (await readdir(join(root, 'config'))).sort() : [],
    deployment: [
      ...['Dockerfile', 'Dockerfile.dev', 'compose.yaml', 'compose.dev.yaml', 'fly.toml'].filter(
        (f) => existsSync(join(root, f)),
      ),
      ...(existsSync(join(root, '.github/workflows'))
        ? (await readdir(join(root, '.github/workflows'))).filter((f) => /release|publish/.test(f))
        : []),
    ].sort(),
    docs: (await walk(join(root, 'docs'), isDoc)).map(rel),
    phaseDocs: existsSync(join(root, 'docs/phases'))
      ? (await readdir(join(root, 'docs/phases'))).filter((f) => f.endsWith('.md')).sort()
      : [],
  };

  // Enumerate declared entrypoints from the binding architecture contract.
  const contract = await readJson(join(root, 'docs/architecture/IRP-ARCHITECTURE-CONTRACT.json'));
  const entrypoints = [];
  for (const declared of contract.hostEntrypoints ?? []) {
    const file = join(root, declared);
    entrypoints.push({
      path: declared,
      exists: existsSync(file),
      composesCanonicalRuntime: existsSync(file)
        ? (await readText(file)).includes('createCanonicalRuntime')
        : false,
      constructsRuntimeDirectly: existsSync(file)
        ? /\bnew\s+ResilienceRuntime\s*\(/.test(await readText(file))
        : false,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
    totals: {
      packages: packages.length,
      workspacePackages: packages.filter((p) => p.kind === 'workspace-package').length,
      nativeClients: packages.filter((p) => p.kind === 'native-client').length,
      packagesWithoutTests: packages.filter((p) => !p.hasTests && p.kind === 'workspace-package')
        .length,
      workflows: infra.workflows.length,
      docs: infra.docs.length,
      phaseDocs: infra.phaseDocs.length,
    },
    infrastructure: infra,
    entrypoints,
  };
}

// ---------------------------------------------------------------------------
// Task 2: runtime path trace (entrypoint -> privileged mutation -> verification)
// ---------------------------------------------------------------------------
const MUTATION_MARKERS = [
  { name: 'safety-kernel-execute', pattern: /safetyKernel\.execute\(/ },
  { name: 'transaction-engine', pattern: /new\s+ActionTransactionEngine\(/ },
  { name: 'coordinated-executor', pattern: /new\s+CoordinatedActionExecutor\(/ },
  {
    name: 'direct-route-mutation',
    pattern: /(?:spawn|exec|execFile)[^\n]*['"](?:ip|route|resolvectl|wg|nmcli|iptables)['"]/,
  },
];
const VERIFICATION_MARKERS = [
  { name: 'runtime-action-verifier', pattern: /RuntimeActionVerifier/ },
  { name: 'verify-call', pattern: /verifier\.verify\(/ },
  { name: 'destination-verification', pattern: /verifyDestination/ },
  { name: 'postcondition-check', pattern: /expectedPostconditions/ },
];

async function buildRuntimePaths() {
  const files = [
    ...(await walk(join(root, 'apps'), isSource)),
    ...(await walk(join(root, 'packages/resilience-runtime/src'), isSource)),
  ];
  const mutationSites = [];
  const verificationSites = [];
  for (const file of files) {
    const text = await readText(file);
    if (/(^|\/)(test|tests|__tests__)\//.test(rel(file))) continue;
    for (const marker of MUTATION_MARKERS) {
      if (marker.pattern.test(text)) {
        mutationSites.push({ marker: marker.name, path: rel(file) });
      }
    }
    for (const marker of VERIFICATION_MARKERS) {
      if (marker.pattern.test(text)) {
        verificationSites.push({ marker: marker.name, path: rel(file) });
      }
    }
  }

  const contract = await readJson(join(root, 'docs/architecture/IRP-ARCHITECTURE-CONTRACT.json'));
  const traces = [];
  for (const declared of contract.hostEntrypoints ?? []) {
    const file = join(root, declared);
    if (!existsSync(file)) continue;
    const text = await readText(file);
    traces.push({
      entrypoint: declared,
      composesCanonicalRuntime: text.includes('createCanonicalRuntime'),
      constructsRuntimeDirectly: /\bnew\s+ResilienceRuntime\s*\(/.test(text),
      reachesSafetyKernel: /safetyKernel|ActionTransactionEngine|CoordinatedActionExecutor/.test(
        text,
      ),
      reachesVerification: /verifyDestination|verification/.test(text),
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    traces,
    mutationSites: mutationSites.sort((a, b) =>
      `${a.marker}${a.path}`.localeCompare(`${b.marker}${b.path}`),
    ),
    verificationSites: verificationSites.sort((a, b) =>
      `${a.marker}${a.path}`.localeCompare(`${b.marker}${b.path}`),
    ),
    summary: {
      entrypoints: traces.length,
      mutationSites: mutationSites.length,
      verificationSites: verificationSites.length,
      everyEntrypointComposesCanonically: traces.every((t) => t.composesCanonicalRuntime),
      noDirectRuntimeConstruction: traces.every((t) => !t.constructsRuntimeDirectly),
    },
  };
}

// ---------------------------------------------------------------------------
// Task 3: capability -> implementation -> owner -> consumer -> runtime path
// ---------------------------------------------------------------------------
const CAPABILITY_DOMAINS =
  /^(?:dns|route|routing|connectivity|tunnel|gateway|observability|network|recovery|plugin|kernel|fabric|egress|transport)[._]/;

/**
 * Capability matrix built from ground truth.
 *
 * Implementations and owners are read from the *executed* canonical adapter
 * registry rather than inferred from text, so the matrix cannot invent
 * capabilities that no registry actually declares. Consumers are then located
 * by searching for those exact capability literals.
 */
/**
 * Source-declared adapter registry.
 *
 * When a compiled `dist/` tree is unavailable, the same default adapter
 * descriptors are parsed from source. This preserves executable ground truth
 * without executing generated output.
 */
function parseAdapterRegistryFromSource(sourceText) {
  const adapters = [];
  const tuplePattern =
    /\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\[([^\]]*)\]\s*,\s*\[([^\]]*)\]\s*\]/g;
  const literals = (listText) =>
    [...listText.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  for (const match of sourceText.matchAll(tuplePattern)) {
    const [, adapterId, subsystem, capabilitiesText, supportedActionsText] = match;
    const capabilities = literals(capabilitiesText);
    const supportedActions = literals(supportedActionsText);
    if (!adapterId || !subsystem || capabilities.length === 0 || supportedActions.length === 0) {
      continue;
    }
    adapters.push({ adapterId, subsystem, capabilities, supportedActions });
  }
  return adapters;
}

async function buildCapabilityMatrix() {
  const registryModule = join(root, 'packages/resilience-runtime/dist/adapter-registry.js');
  const registry = {
    available: false,
    source: 'text scan fallback',
    adapters: [],
    error: undefined,
  };
  if (existsSync(registryModule)) {
    try {
      const { createDefaultRuntimeAdapterRegistry } = await import(
        `file://${resolve(registryModule)}`
      );
      const instance = createDefaultRuntimeAdapterRegistry();
      registry.available = true;
      registry.source = 'canonical adapter registry (executed)';
      registry.adapters = instance.list().map((descriptor) => ({
        adapterId: descriptor.adapterId,
        subsystem: descriptor.subsystem,
        capabilities: [...descriptor.capabilities],
        supportedActions: [...descriptor.supportedActions],
        supportsLive: descriptor.supportsLive,
        verificationSupport: descriptor.verificationSupport,
        recoverySupport: descriptor.recoverySupport,
      }));
    } catch (error) {
      registry.error = error instanceof Error ? error.message : String(error);
    }
  }
  if (!registry.available) {
    const sourceText = await readText(
      join(root, 'packages/resilience-runtime/src/adapter-registry.ts'),
    );
    const sourceAdapters = parseAdapterRegistryFromSource(sourceText);
    if (sourceAdapters.length > 0) {
      registry.available = true;
      registry.source = 'canonical adapter registry (source-declared)';
      registry.adapters = sourceAdapters;
    }
  }

  const files = [
    ...(await walk(join(root, 'apps'), isSource)),
    ...(await walk(join(root, 'packages'), isSource)),
  ];

  const rows = new Map();
  const ensure = (capability) => {
    if (!rows.has(capability)) {
      rows.set(capability, {
        capability,
        implementations: new Set(),
        owners: new Set(),
        consumers: new Set(),
        runtimePaths: new Set(),
      });
    }
    return rows.get(capability);
  };

  // 1. Implementations + owners come from the canonical registry.
  const declared = new Set();
  for (const adapter of registry.adapters) {
    const sourcePath = `packages/resilience-runtime/src/adapter-registry.ts`;
    for (const capability of adapter.capabilities) {
      declared.add(capability);
      const row = ensure(capability);
      row.implementations.add(`${sourcePath}#${adapter.adapterId}`);
      row.owners.add(`@irp/resilience-runtime:${adapter.subsystem}`);
      row.runtimePaths.add(`${sourcePath}#${adapter.adapterId}`);
    }
  }

  // 2. Consumers are located by exact literal search for declared capabilities.
  const ownerOfFile = (r) =>
    r.startsWith('apps/')
      ? `@irp/${r.split('/')[1]}`
      : (() => {
          const m = /packages\/([^/]+)/.exec(r);
          return m ? `@irp/${m[1]}` : r;
        })();

  for (const file of files) {
    const r = rel(file);
    if (/(^|\/)(test|tests|__tests__)\//.test(r)) continue;
    const text = await readText(file);
    for (const capability of declared) {
      if (!text.includes(`'${capability}'`) && !text.includes(`"${capability}"`)) continue;
      const row = ensure(capability);
      row.consumers.add(r);
      row.runtimePaths.add(r);
      row.owners.add(ownerOfFile(r));
    }
  }

  // 3. Fabric capability registry declarations are also implementations.
  const fabricFile = join(root, 'packages/resilience-runtime/src/fabric-authority.ts');
  if (existsSync(fabricFile)) {
    const text = await readText(fabricFile);
    for (const m of text.matchAll(/id:\s*'([a-z]+(?:\.[a-z]+)+)'/g)) {
      const capability = m[1];
      if (!CAPABILITY_DOMAINS.test(capability)) continue;
      const row = ensure(capability);
      row.implementations.add(rel(fabricFile));
      row.owners.add('@irp/resilience-runtime:fabric');
      row.runtimePaths.add(rel(fabricFile));
    }
  }

  const capabilities = [...rows.values()]
    .map((row) => ({
      capability: row.capability,
      implementations: [...row.implementations].sort(),
      owners: [...row.owners].sort(),
      consumers: [...row.consumers].sort(),
      runtimePaths: [...row.runtimePaths].sort(),
      hasImplementation: row.implementations.size > 0,
      hasOwner: row.owners.size > 0,
      hasConsumer: row.consumers.size > 0,
    }))
    .sort((a, b) => a.capability.localeCompare(b.capability));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: registry.available
      ? registry.source
      : `text scan fallback${registry.error ? `: ${registry.error}` : ''}`,
    registryAdapters: registry.adapters,
    capabilities,
    summary: {
      total: capabilities.length,
      withoutImplementation: capabilities
        .filter((c) => !c.hasImplementation)
        .map((c) => c.capability),
      withoutOwner: capabilities.filter((c) => !c.hasOwner).map((c) => c.capability),
      withoutConsumer: capabilities.filter((c) => !c.hasConsumer).map((c) => c.capability),
    },
  };
}

// ---------------------------------------------------------------------------
// Task 4: decision / mutation authority map
// ---------------------------------------------------------------------------
const FORBIDDEN_AUTHORITIES = [
  'NetworkAutopilot',
  'DecisionEngine',
  'PolicyEngine',
  'SafetyKernel',
  'StateRegistry',
  'TransactionExecutor',
  'EventBus',
  'ProviderRegistry',
  'Planner',
];

// Canonical component owners. These names resemble forbidden authorities, so
// construction outside the listed owner is reported as drift rather than being
// silently accepted.
const CANONICAL_COMPONENT_OWNERS = {
  NetworkAutopilot: ['packages/resilience-runtime/src/autopilot/autopilot.ts'],
  DecisionOrchestrator: [
    'packages/resilience-runtime/src/decision-orchestration.ts',
    'packages/resilience-runtime/src/runtime.ts',
  ],
  DeterministicPlanner: [
    'packages/resilience-runtime/src/planning/planner.ts',
    'packages/resilience-runtime/src/replay/replay.ts',
    'packages/resilience-runtime/src/runtime.ts',
  ],
  SafetyRollbackRecoveryKernel: [
    'packages/resilience-runtime/src/safety/safety-kernel.ts',
    'packages/resilience-runtime/src/runtime.ts',
  ],
  PolicyRegistry: ['packages/resilience-runtime/src/policy/registry.ts'],
};

async function buildAuthorityMap() {
  const files = [
    ...(await walk(join(root, 'apps'), isSource)),
    ...(await walk(join(root, 'packages'), isSource)),
    ...(await walk(join(root, 'clients'), (f) => /\.(kt|swift|ts|tsx)$/.test(f))),
  ];
  const violations = [];
  const authorities = [];
  for (const file of files) {
    const r = rel(file);
    if (/(^|\/)(test|tests|__tests__)\//.test(r)) continue;
    const text = await readText(file);
    for (const symbol of FORBIDDEN_AUTHORITIES) {
      const constructs = new RegExp(`\\bnew\\s+${symbol}\\s*\\(`).test(text);
      const extendsSymbol = new RegExp(`\\bextends\\s+${symbol}\\b`).test(text);
      const imported = new RegExp(
        `(?:^|\\n)\\s*import\\s+(?:type\\s+)?[^;\\n]*\\b${symbol}\\b[^;\\n]*;`,
      ).test(text);
      const exported = new RegExp(
        `(?:^|\\n)\\s*export\\s+(?:type\\s+)?[^;\\n]*\\b${symbol}\\b[^;\\n]*;`,
      ).test(text);
      const inRuntime = r.startsWith('packages/resilience-runtime/');
      if ((constructs || extendsSymbol || imported || exported) && !inRuntime) {
        violations.push({ symbol, path: r, constructs, extends: extendsSymbol, imported, exported });
      }
    }
    for (const [component, owners] of Object.entries(CANONICAL_COMPONENT_OWNERS)) {
      const constructed = new RegExp(`\\bnew\\s+${component}\\s*\\(`).test(text);
      const extended = new RegExp(`\\bextends\\s+${component}\\b`).test(text);
      if ((constructed || extended) && !owners.includes(r)) {
        violations.push({ symbol: component, path: r, constructs: constructed, extends: extended });
      }
    }
    if (r.startsWith('apps/') || r.startsWith('packages/')) {
      if (/createCanonicalRuntime/.test(text)) {
        authorities.push({
          path: r,
          composesCanonicalRuntime: true,
          constructsRuntimeDirectly: /\bnew\s+ResilienceRuntime\s*\(/.test(text),
          role: 'host-composition',
        });
      }
      if (/safetyKernel|SafetyRollbackRecoveryKernel/.test(text)) {
        authorities.push({ path: r, composesCanonicalRuntime: false, role: 'safety-kernel-host' });
      }
    }
  }

  const contract = await readJson(join(root, 'docs/architecture/IRP-ARCHITECTURE-CONTRACT.json'));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    contractAuthorities: contract.authorities ?? {},
    productionAuthorityCount: contract.canonicalRuntime?.productionAuthorityCount ?? null,
    compositionSymbol: contract.canonicalRuntime?.composition ?? null,
    hosts: authorities.sort((a, b) => a.path.localeCompare(b.path)),
    violations,
    summary: {
      hosts: authorities.length,
      violations: violations.length,
      singleProductionAuthority: contract.canonicalRuntime?.productionAuthorityCount === 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Task 5: phase document audit
// ---------------------------------------------------------------------------
async function buildPhaseAudit() {
  const auditTargets = [
    { directory: 'docs/phases', kind: 'phase' },
    { directory: 'artifacts/issues', kind: 'issue-evidence' },
  ];
  const phases = [];
  for (const target of auditTargets) {
    const dir = join(root, target.directory);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
    for (const file of files) {
      const text = await readText(join(dir, file));
      const number = Number.parseInt(/phase-(\d+)/.exec(file)?.[1] ?? '', 10);
      const claimsImplementation = /\b(implemented|merged|complete[d]?)\b/i.test(text);
      const citesEvidence =
        /\b(PR|commit|CI run|evidence|sha)\b/i.test(text) || /`[0-9a-f]{7,40}`/.test(text);
      const hasTestEvidence = /\.test\.|tests\/|vitest/i.test(text);
      phases.push({
        file: `${target.directory}/${file}`,
        kind: target.kind,
        number: Number.isFinite(number) ? number : null,
        beyondPhase78: Number.isFinite(number) ? number > 78 : false,
        claimsImplementation,
        citesEvidence,
        hasTestEvidence,
        // Historical claims without evidence are recorded, never treated as current proof.
        evidenceClass: !claimsImplementation
          ? 'descriptive'
          : citesEvidence && hasTestEvidence
            ? 'evidence-backed'
            : citesEvidence
              ? 'claim-with-citation'
              : 'unsubstantiated-claim',
      });
    }
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    phases,
    summary: {
      total: phases.length,
      phaseDocuments: phases.filter((p) => p.kind === 'phase').length,
      issueEvidenceDocuments: phases.filter((p) => p.kind === 'issue-evidence').length,
      beyondPhase78: phases.filter((p) => p.beyondPhase78).map((p) => p.file),
      unsubstantiated: phases
        .filter((p) => p.evidenceClass === 'unsubstantiated-claim')
        .map((p) => p.file),
      evidenceBacked: phases.filter((p) => p.evidenceClass === 'evidence-backed').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Tasks 6/7: orphans, dead paths, duplicate contracts
// ---------------------------------------------------------------------------
async function buildOrphans() {
  const pkgRoot = join(root, 'packages/resilience-runtime');
  const srcFiles = await walk(join(pkgRoot, 'src'), isSource);
  const testFiles = await walk(join(pkgRoot, 'tests'), isSource);
  const vitestInclude = await readText(join(pkgRoot, 'vitest.config.ts'));
  const includeMatch = /include:\s*\[([^\]]+)\]/.exec(vitestInclude);
  const includeGlobs = includeMatch
    ? [...includeMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    : [];

  const allText = new Map();
  for (const file of [...srcFiles, ...testFiles]) allText.set(file, await readText(file));

  // Orphaned tests: compiled by tsc but not matched by any vitest include glob.
  const orphanTests = srcFiles
    .filter((f) => /(^|\/)(test|tests|__tests__)\//.test(rel(f)) || /\.test\.|\.spec\./.test(f))
    .filter(
      (f) =>
        !includeGlobs.some(
          (glob) =>
            glob.endsWith('tests/**/*.test.ts') &&
            rel(f).includes('tests/') &&
            rel(f).endsWith('.test.ts'),
        ),
    )
    .map((f) => rel(f));

  // Orphaned modules: src files unreachable from the root barrel. Barrel
  // re-export chains are resolved transitively, otherwise every module exported
  // only through `resilience/index.ts` or `platform/index.ts` would look
  // orphaned.
  const rootBarrel = join(pkgRoot, 'src/index.ts');
  const resolveSpecifier = (fromFile, specifier) => {
    const base = specifier.replace(/\.js$/, '');
    const candidate = join(fromFile, '..', `${base}.ts`);
    return candidate;
  };

  const reachable = new Set();
  const queue = [rootBarrel];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || reachable.has(current)) continue;
    if (!existsSync(current)) continue;
    reachable.add(current);
    const text = await readText(current);
    for (const m of text.matchAll(/(?:from|export\s+\*)\s+'([^']+)'/g)) {
      const next = resolveSpecifier(current, m[1]);
      if (!reachable.has(next)) queue.push(next);
    }
  }

  const allSrc = new Set(srcFiles);
  const orphanModules = srcFiles
    .filter((f) => f !== rootBarrel && !f.endsWith('.d.ts'))
    .filter((f) => {
      if (allSrc.has(f) && reachable.has(f)) return false;
      const r = rel(f);
      // Modules intentionally consumed only by their own subtree tests are
      // still reachable if any test imports them.
      for (const [testFile, testText] of allText) {
        if (!/(^|\/)(test|tests|__tests__)\//.test(rel(testFile))) continue;
        const base = r.replace(/^packages\/resilience-runtime\/src\//, '').replace(/\.ts$/, '');
        if (testText.includes(`../src/${base}.js`) || testText.includes(`./${base}.js`)) {
          return false;
        }
      }
      return true;
    })
    .map((f) => rel(f));

  // Duplicate exported symbol names across packages.
  const exported = new Map();
  for (const file of await walk(join(root, 'packages'), isSource)) {
    const text = await readText(file);
    for (const m of text.matchAll(
      /export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|const|function|enum)\s+([A-Za-z0-9_]+)/g,
    )) {
      const name = m[1];
      if (!exported.has(name)) exported.set(name, new Set());
      exported.get(name).add(rel(file));
    }
  }
  const duplicateContracts = [...exported.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([name, files]) => ({ name, declaredIn: [...files].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Persistence models declared but never referenced outside their declaration.
  const persistenceModels = [];
  for (const file of await walk(join(root, 'packages/database'), isSource)) {
    const text = await readText(file);
    for (const m of text.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/gi)) {
      const table = m[1];
      let used = false;
      for (const [other, otherText] of allText) {
        if (other === file) continue;
        if (otherText.includes(table)) {
          used = true;
          break;
        }
      }
      persistenceModels.push({ table, declaredIn: rel(file), referenced: used });
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    vitestIncludeGlobs: includeGlobs,
    orphanTests,
    orphanModules,
    duplicateContracts,
    persistenceModels,
    summary: {
      orphanTests: orphanTests.length,
      orphanModules: orphanModules.length,
      duplicateContracts: duplicateContracts.length,
      unreferencedPersistenceModels: persistenceModels.filter((m) => !m.referenced).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Task 8: reconcile architecture graphs with source evidence
// ---------------------------------------------------------------------------
const ARCHITECTURE_GRAPHS = [
  'docs/architecture/system-integration-map.json',
  'docs/architecture/runtime-execution-graph.json',
  'docs/architecture/failure-recovery-graph.json',
  'docs/architecture/security-boundary-graph.json',
];

/**
 * Verifies that every owner/path referenced by an architecture graph resolves to
 * something that actually exists in source, and that declared entrypoints and
 * stages are real. A graph that drifts from source is worse than no graph.
 */
async function buildGraphReconciliation(inventory, paths) {
  const graphs = [];
  const unreferenced = [];

  const resolveOwner = (owner) => {
    if (!owner) return [];
    const matches = [];
    // Owners are written as `@irp/pkg ...` or `apps/thing` or `clients/*`.
    for (const m of owner.matchAll(/@irp\/([a-z0-9-]+)/g)) {
      matches.push(`packages/${m[1]}`);
    }
    for (const m of owner.matchAll(/\b(apps|clients)\/([a-z0-9*-]+)/g)) {
      matches.push(`${m[1]}/${m[2]}`);
    }
    return [...new Set(matches)];
  };

  for (const graphPath of ARCHITECTURE_GRAPHS) {
    const file = join(root, graphPath);
    if (!existsSync(file)) {
      unreferenced.push({ graph: graphPath, reason: 'missing' });
      continue;
    }
    const graph = await readJson(file);
    const nodes = graph.nodes ?? [];
    const checked = [];

    for (const node of nodes) {
      const owners = resolveOwner(node.owner);
      const resolved = owners.filter((candidate) => {
        const wildcard = candidate.includes('*');
        if (wildcard) {
          const [group] = candidate.split('/');
          return existsSync(join(root, group));
        }
        return (
          existsSync(join(root, candidate, 'package.json')) || existsSync(join(root, candidate))
        );
      });
      const evidence = {
        node: node.id ?? node.kind ?? 'unknown',
        declaredOwner: node.owner ?? null,
        declaredStatus: node.status ?? null,
        resolvedPaths: owners,
        resolvable: owners.length === 0 ? resolved.length === 0 : resolved.length > 0,
      };
      checked.push(evidence);
      if (!evidence.resolvable) {
        unreferenced.push({
          graph: graphPath,
          node: evidence.node,
          declaredOwner: node.owner ?? null,
          reason: owners.length === 0 ? 'owner-not-parsable' : 'owner-path-missing',
        });
      }
    }

    // Entrypoint claims in the execution graph must match the contract + source.
    // Graph entries may be descriptive labels such as
    // "apps/daemon/src/index.ts RuntimeScheduler", so only the leading
    // path-like token is treated as a filesystem path.
    let entrypointDrift = [];
    if (Array.isArray(graph.entrypoints)) {
      for (const declared of graph.entrypoints) {
        const raw = typeof declared === 'string' ? declared : declared?.path;
        if (!raw) continue;
        const path = /^[^\s]*\.(?:ts|tsx|mts|js|mjs|cjs)$/.exec(raw.trim())?.[0];
        if (!path) continue; // descriptive-only entry (e.g. a class name)
        if (path.includes('/')) {
          const onDisk = existsSync(join(root, path));
          const traced = paths.traces.find((t) => t.entrypoint === path);
          if (!onDisk || (traced && !traced.composesCanonicalRuntime)) {
            entrypointDrift.push({
              graph: graphPath,
              entrypoint: path,
              exists: onDisk,
              traced: Boolean(traced),
            });
          }
        }
      }
    }

    graphs.push({
      graph: graphPath,
      schemaVersion: graph.schemaVersion ?? null,
      nodeCount: nodes.length,
      nodesChecked: checked.length,
      unreferencedNodes: checked.filter((n) => !n.resolvable).length,
      entrypointDrift,
      nodes: checked,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    graphs,
    unreferenced,
    summary: {
      graphs: graphs.length,
      nodesChecked: graphs.reduce((sum, g) => sum + g.nodesChecked, 0),
      unreferencedNodes: unreferenced.length,
      entrypointDrift: graphs.reduce((sum, g) => sum + g.entrypointDrift.length, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Task 9: architecture drift register
// ---------------------------------------------------------------------------
async function buildDriftRegister(inventory, paths, matrix, authority, phases, orphans, graphs) {
  const findings = [];
  const add = (finding) => findings.push({ ...finding, registeredAt: new Date().toISOString() });

  for (const trace of paths.traces) {
    if (!trace.composesCanonicalRuntime) {
      add({
        id: `entrypoint-not-canonical:${trace.entrypoint}`,
        severity: 'CRITICAL',
        area: 'authority',
        evidence: [trace.entrypoint],
        impact: 'Host does not compose through the canonical runtime boundary.',
        owner: '@irp/resilience-runtime',
        fix: 'Compose the host through createCanonicalRuntime.',
        verification: 'pnpm run architecture:check',
      });
    }
    if (trace.constructsRuntimeDirectly) {
      add({
        id: `direct-runtime-construction:${trace.entrypoint}`,
        severity: 'CRITICAL',
        area: 'authority',
        evidence: [trace.entrypoint],
        impact: 'Host bypasses the canonical composition boundary.',
        owner: '@irp/resilience-runtime',
        fix: 'Use createCanonicalRuntime instead of new ResilienceRuntime.',
        verification: 'pnpm run architecture:check',
      });
    }
  }

  for (const contract of authority.violations) {
    add({
      id: `forbidden-authority:${contract.symbol}:${contract.path}`,
      severity: 'CRITICAL',
      area: 'authority',
      evidence: [contract.path],
      impact: `Production source constructs or extends forbidden authority ${contract.symbol}.`,
      owner: '@irp/resilience-runtime',
      fix: `Remove the competing ${contract.symbol} authority and extend the canonical owner.`,
      verification: 'pnpm run architecture:guards',
    });
  }

  for (const drift of graphs.unreferenced) {
    add({
      id: `graph-owner-unresolvable:${drift.graph}:${drift.node ?? 'unknown'}`,
      severity: 'MAJOR',
      area: 'architecture-graph',
      evidence: [drift.graph, ...(drift.declaredOwner ? [drift.declaredOwner] : [])],
      impact: `Architecture graph node "${drift.node ?? 'unknown'}" declares owner "${drift.declaredOwner}" which does not resolve to source (${drift.reason}).`,
      owner: 'docs-owner',
      fix: 'Update the graph to the real owner path, or restore the referenced source.',
      verification: 'pnpm run architecture:archaeology',
    });
  }

  for (const drift of graphs.graphs) {
    for (const entry of drift.entrypointDrift) {
      add({
        id: `graph-entrypoint-drift:${drift.graph}:${entry.entrypoint}`,
        severity: 'CRITICAL',
        area: 'architecture-graph',
        evidence: [drift.graph, entry.entrypoint],
        impact:
          'Architecture graph declares an entrypoint that is missing or does not compose canonically.',
        owner: '@irp/resilience-runtime',
        fix: 'Reconcile the execution graph with the binding architecture contract and source.',
        verification: 'pnpm run architecture:check',
      });
    }
  }

  for (const duplicate of orphans.duplicateContracts) {
    add({
      id: `duplicate-contract:${duplicate.name}`,
      severity: 'MINOR',
      area: 'contract-duplication',
      evidence: duplicate.declaredIn,
      impact: `Symbol ${duplicate.name} is declared in ${duplicate.declaredIn.length} modules, risking divergent semantics.`,
      owner: duplicate.declaredIn[0]?.split('/').slice(0, 2).join('/') ?? 'unassigned',
      fix: 'Re-export a single canonical declaration instead of redefining the symbol.',
      verification: 'pnpm run architecture:archaeology',
    });
  }

  for (const capability of matrix.capabilities) {
    if (!capability.hasImplementation) {
      add({
        id: `capability-without-implementation:${capability.capability}`,
        severity: 'MAJOR',
        area: 'capability',
        evidence: capability.runtimePaths,
        impact: `Capability ${capability.capability} has no implementation evidence.`,
        owner: capability.owners[0] ?? 'unassigned',
        fix: 'Implement the capability or remove the declaration.',
        verification: 'node scripts/archaeology.mjs',
      });
    }
  }

  for (const file of orphans.orphanTests) {
    add({
      id: `orphaned-test:${file}`,
      severity: 'MAJOR',
      area: 'testing',
      evidence: [file, 'vitest.config.ts'],
      impact: 'Test file is compiled but never executed by the configured vitest include globs.',
      owner: '@irp/resilience-runtime',
      fix: 'Move the test under tests/ so the configured include glob executes it.',
      verification: 'pnpm --filter @irp/resilience-runtime test',
    });
  }

  for (const phase of phases.phases) {
    if (phase.evidenceClass === 'unsubstantiated-claim') {
      add({
        id: `unsubstantiated-phase-claim:${phase.file}`,
        severity: 'MINOR',
        area: 'documentation',
        evidence: [phase.file],
        impact: 'Phase document claims implementation without citing source, test or CI evidence.',
        owner: 'docs-owner',
        fix: 'Cite the implementing commit/PR and tests, or mark the phase as historical.',
        verification: 'pnpm run validate:docs',
      });
    }
  }

  for (const entry of inventory.entrypoints) {
    if (!entry.exists) {
      add({
        id: `declared-entrypoint-missing:${entry.path}`,
        severity: 'CRITICAL',
        area: 'architecture-contract',
        evidence: ['docs/architecture/IRP-ARCHITECTURE-CONTRACT.json'],
        impact: 'Architecture contract declares a host entrypoint that does not exist.',
        owner: '@irp/resilience-runtime',
        fix: 'Restore the entrypoint or update the binding contract.',
        verification: 'pnpm run architecture:check',
      });
    }
  }

  const order = { CRITICAL: 0, MAJOR: 1, MINOR: 2, INFO: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    findings,
    summary: {
      total: findings.length,
      critical: findings.filter((f) => f.severity === 'CRITICAL').length,
      major: findings.filter((f) => f.severity === 'MAJOR').length,
      minor: findings.filter((f) => f.severity === 'MINOR').length,
    },
  };
}

// ---------------------------------------------------------------------------
async function main() {
  await mkdir(outDir, { recursive: true });

  const inventory = await buildInventory();
  const paths = await buildRuntimePaths();
  const matrix = await buildCapabilityMatrix();
  const authority = await buildAuthorityMap();
  const phases = await buildPhaseAudit();
  const orphans = await buildOrphans();
  const graphs = await buildGraphReconciliation(inventory, paths);
  const drift = await buildDriftRegister(
    inventory,
    paths,
    matrix,
    authority,
    phases,
    orphans,
    graphs,
  );

  const artifacts = {
    'inventory.json': inventory,
    'runtime-paths.json': paths,
    'capability-matrix.json': matrix,
    'authority-map.json': authority,
    'phase-audit.json': phases,
    'orphans.json': orphans,
    'graph-reconciliation.json': graphs,
    'drift-register.json': drift,
  };
  for (const [name, value] of Object.entries(artifacts)) {
    await writeFile(join(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
  }

  // Human-readable drift register table.
  const rows = [
    '| Severity | Finding | Area | Owner | Verification |',
    '| --- | --- | --- | --- | --- |',
    ...drift.findings.map(
      (f) => `| ${f.severity} | ${f.id} | ${f.area} | ${f.owner} | ${f.verification} |`,
    ),
  ];
  await writeFile(join(root, 'artifacts/archaeology/drift-register.md'), `${rows.join('\n')}\n`);

  console.log('REPOSITORY ARCHAEOLOGY: complete');
  console.log(`  packages inventoried      : ${inventory.totals.packages}`);
  console.log(`  entrypoints traced        : ${paths.summary.entrypoints}`);
  console.log(`  capabilities mapped       : ${matrix.summary.total}`);
  console.log(`  authority violations      : ${authority.summary.violations}`);
  console.log(`  phase documents audited   : ${phases.summary.phaseDocuments}`);
  console.log(`  issue evidence audited    : ${phases.summary.issueEvidenceDocuments}`);
  console.log(`  orphaned tests            : ${orphans.summary.orphanTests}`);
  console.log(`  orphaned modules          : ${orphans.summary.orphanModules}`);
  console.log(`  duplicate contracts       : ${orphans.summary.duplicateContracts}`);
  console.log(
    `  graph nodes reconciled    : ${graphs.summary.nodesChecked} (unreferenced ${graphs.summary.unreferencedNodes})`,
  );
  console.log(
    `  drift findings            : ${drift.summary.total} (critical ${drift.summary.critical}, major ${drift.summary.major}, minor ${drift.summary.minor})`,
  );
  console.log(`  artifacts                 : ${relative(root, outDir)}`);

  if (drift.summary.critical > 0) {
    console.error('\nCRITICAL architecture drift detected:');
    for (const finding of drift.findings.filter((f) => f.severity === 'CRITICAL')) {
      console.error(`- ${finding.id}`);
    }
    process.exitCode = 1;
  }
}

await main();
