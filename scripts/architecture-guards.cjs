/**
 * Architecture guards for Phase 5 - CI checks that enforce canonical architecture.
 * These checks run in CI and fail the build if architectural invariants are violated.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const errors = [];

const fail = (message) => errors.push(message);
const readJson = (path) => {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${path}: invalid JSON: ${error.message}`);
    return null;
  }
};

// Check 1: No duplicate authority symbols in production code
const forbiddenSymbols = [
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

const productionRoots = ['apps', 'packages'];
const skipDirectories = new Set(['.git', 'node_modules', 'dist', '.turbo', 'coverage', 'artifacts']);
const sourceFiles = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirectories.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) sourceFiles.push(full);
  }
}

for (const rootName of productionRoots) walk(path.join(root, rootName));

const isTestOrLegacy = (file) => {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  return (
    /(^|\/)(test|tests|__tests__)\//.test(rel) ||
    rel.includes('/src/legacy/') ||
    (rel.startsWith('apps/') && rel.includes('/test/'))
  );
};

for (const file of sourceFiles) {
  if (isTestOrLegacy(file)) continue;
  const rel = path.relative(root, file).replaceAll('\\', '/');
  const text = fs.readFileSync(file, 'utf8');

  // Check for forbidden authority symbols
  for (const symbol of forbiddenSymbols) {
    const importPattern = new RegExp(`(?:^|\\n)\\s*import\\s+(?:type\\s+)?[^;\\n]*\\b${symbol}\\b[^;\\n]*;`);
    const exportPattern = new RegExp(`(?:^|\\n)\\s*export\\s+(?:type\\s+)?[^;\\n]*\\b${symbol}\\b[^;\\n]*;`);
    const constructionPattern = new RegExp(`\\bnew\\s+${symbol}\\s*\\(`);
    const inheritancePattern = new RegExp(`\\bextends\\s+${symbol}\\b`);

    if (importPattern.test(text) || exportPattern.test(text)) {
      fail(`${rel}: production source imports or exports forbidden authority symbol ${symbol}`);
    }
    if (constructionPattern.test(text) && !rel.startsWith('packages/resilience-runtime/')) {
      fail(`${rel}: production source constructs forbidden authority ${symbol}`);
    }
    if (inheritancePattern.test(text) && !rel.startsWith('packages/resilience-runtime/')) {
      fail(`${rel}: production source inherits from forbidden authority ${symbol}`);
    }
  }

  // Check for direct privileged mutation
  const mutationPatterns = [
    { name: 'direct IP route mutation', pattern: /(?:spawn|spawnSync|exec|execFile)\s*\([^\n]*(?:['"]ip['"]|['"]route['"]|['"]resolvectl['"]|['"]wg['"]|['"]nmcli['"]|['"]iptables['"])/ },
    { name: 'direct network manager mutation', pattern: /(?:spawn|spawnSync|exec|execFile)\s*\([^\n]*(?:['"]systemctl['"])[^\n]*(?:network|resolved|wireguard)/i },
  ];

  for (const { name, pattern } of mutationPatterns) {
    if (pattern.test(text) && /^(apps|packages)\/(?:api|cli|.*client|plugin)/.test(rel)) {
      fail(`${rel}: forbidden ${name}`);
    }
  }
}

// Check 2: Canonical runtime composition boundary
const compositionPath = path.join(root, 'packages/resilience-runtime/src/canonical-runtime-composition.ts');
if (!fs.existsSync(compositionPath)) {
  fail('missing packages/resilience-runtime/src/canonical-runtime-composition.ts');
} else {
  const comp = fs.readFileSync(compositionPath, 'utf8');
  if (!comp.includes('createCanonicalRuntime')) fail('canonical-runtime-composition.ts missing createCanonicalRuntime');
  if (!comp.includes('new ResilienceRuntime')) fail('canonical-runtime-composition.ts missing ResilienceRuntime instantiation');
}

// Check 3: Host entrypoints use canonical composition
const requiredHostEntrypoints = [
  'apps/daemon/src/index.ts',
  'packages/linux-client/src/index.ts',
];
for (const entry of requiredHostEntrypoints) {
  const entryPath = path.join(root, entry);
  if (!fs.existsSync(entryPath)) {
    fail(`host entrypoint missing: ${entry}`);
  } else {
    const source = fs.readFileSync(entryPath, 'utf8');
    if (!source.includes('createCanonicalRuntime')) fail(`${entry} missing createCanonicalRuntime`);
    if (source.includes('new ResilienceRuntime')) fail(`${entry} must not construct ResilienceRuntime directly`);
  }
}

// Check 4: Architecture contract exists and is binding
const contractPath = path.join(root, 'docs/architecture/IRP-ARCHITECTURE-CONTRACT.json');
if (!fs.existsSync(contractPath)) {
  fail('missing docs/architecture/IRP-ARCHITECTURE-CONTRACT.json');
} else {
  const contract = readJson(contractPath);
  if (contract?.status !== 'binding') fail('architecture contract must have status=binding');
  if (contract?.canonicalRuntime?.package !== '@irp/resilience-runtime') fail('canonical runtime package must be @irp/resilience-runtime');
  if (contract?.canonicalRuntime?.symbol !== 'ResilienceRuntime') fail('canonical runtime symbol must be ResilienceRuntime');
  if (contract?.canonicalRuntime?.composition !== 'createCanonicalRuntime') fail('canonical runtime composition must be createCanonicalRuntime');
  if (contract?.canonicalRuntime?.productionAuthorityCount !== 1) fail('productionAuthorityCount must equal 1');
}

// Check 5: No NetworkAutopilot in production (except allowed paths)
const allowedAutopilotPaths = [
  'packages/resilience-runtime/tests/',
  'packages/resilience-runtime/src/legacy/',
  'docs/',
  'artifacts/',
];
for (const file of sourceFiles) {
  if (isTestOrLegacy(file)) continue;
  const rel = path.relative(root, file).replaceAll('\\', '/');
  const allowed = allowedAutopilotPaths.some((p) => rel.startsWith(p));
  if (!allowed) {
    const text = fs.readFileSync(file, 'utf8');
    if (/\bnew\s+NetworkAutopilot\s*\(/.test(text)) {
      fail(`${rel}: production source instantiates deprecated NetworkAutopilot`);
    }
  }
}

// Check 6: AI cannot directly execute privileged operations
const providerPath = path.join(root, 'packages/resilience-runtime/src/canonical-decision-provider.ts');
if (fs.existsSync(providerPath)) {
  const provider = fs.readFileSync(providerPath, 'utf8');
  if (!provider.includes('InternetIntelligenceBridge')) fail('canonical-decision-provider.ts missing InternetIntelligenceBridge');
  // AI bridge must be called before engine, not after execution
  if (provider.includes('execFile') || provider.includes('resolvectl') || provider.includes('iptables')) {
    fail('canonical-decision-provider.ts must not contain privileged mutation code');
  }
}

// Check 7: Bounded closed-loop is safe-by-default
const closedLoopPath = path.join(root, 'packages/resilience-runtime/src/closed-loop.ts');
if (fs.existsSync(closedLoopPath)) {
  const closed = fs.readFileSync(closedLoopPath, 'utf8');
  if (!closed.includes('DEFAULT_MAX_CYCLES = 1')) fail('DEFAULT_MAX_CYCLES must be 1');
  if (!closed.includes('MAX_ALLOWED_CYCLES = 10')) fail('MAX_ALLOWED_CYCLES must be 10');
  if (!closed.includes('signal?.aborted')) fail('closed-loop must respect abort signal');
}

// Check 8: AGENTS.md is quick start not mission prompt
const agentsPath = path.join(root, 'AGENTS.md');
if (fs.existsSync(agentsPath)) {
  const ag = fs.readFileSync(agentsPath, 'utf8');
  if (!ag.includes('Agent Quick Start')) fail('AGENTS.md must contain "Agent Quick Start"');
  if (ag.length >= 5000) fail('AGENTS.md must be less than 5000 characters (quick start, not mission prompt)');
}

// Check 9: Federated evidence is advisory (fail-open)
const runtimePath = path.join(root, 'packages/resilience-runtime/src/runtime.ts');
if (fs.existsSync(runtimePath)) {
  const runtime = fs.readFileSync(runtimePath, 'utf8');
  if (runtime.includes('federationRequired')) fail('runtime must not require federation');
  const providerPath = path.join(root, 'packages/resilience-runtime/src/canonical-decision-provider.ts');
  if (fs.existsSync(providerPath)) {
    const provider = fs.readFileSync(providerPath, 'utf8');
    if (!provider.includes('federatedEvidence')) fail('canonical-decision-provider must handle federatedEvidence');
  }
}

// Check 10: Architecture maps exist with schemaVersion 1
const archMapPaths = [
  'docs/architecture/system-integration-map.json',
  'docs/architecture/runtime-execution-graph.json',
  'docs/architecture/failure-recovery-graph.json',
  'docs/architecture/security-boundary-graph.json',
];
for (const p of archMapPaths) {
  const pPath = path.join(root, p);
  if (!fs.existsSync(pPath)) {
    fail(`architecture map missing: ${p}`);
  } else {
    const j = readJson(pPath);
    if (j?.schemaVersion !== 1) fail(`${p} must have schemaVersion 1`);
  }
}

// Check 11: Canonical runtime is sole production authority
const contract = readJson(contractPath);
if (contract?.authorities?.runtime !== '@irp/resilience-runtime') fail('canonical runtime authority must be @irp/resilience-runtime');
if (contract?.authorities?.decision !== '@irp/resilience-runtime') fail('canonical decision authority must be @irp/resilience-runtime');
if (contract?.authorities?.policy !== '@irp/resilience-runtime') fail('canonical policy authority must be @irp/resilience-runtime');
if (contract?.authorities?.safety !== '@irp/resilience-runtime') fail('canonical safety authority must be @irp/resilience-runtime');
if (contract?.authorities?.planning !== '@irp/resilience-runtime') fail('canonical planning authority must be @irp/resilience-runtime');
if (contract?.authorities?.transaction !== '@irp/resilience-runtime') fail('canonical transaction authority must be @irp/resilience-runtime');
if (contract?.authorities?.verification !== '@irp/resilience-runtime') fail('canonical verification authority must be @irp/resilience-runtime');
if (contract?.authorities?.recovery !== '@irp/resilience-runtime') fail('canonical recovery authority must be @irp/resilience-runtime');

// Check 12: Run architecture validation script
const archCheck = require('child_process').spawnSync('node', ['scripts/architecture/validate-architecture.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
if (archCheck.status !== 0) {
  fail(`architecture contract validation failed: ${archCheck.stderr || archCheck.stdout}`);
}

if (errors.length) {
  console.error(`Architecture guard failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('All architecture guards passed.');