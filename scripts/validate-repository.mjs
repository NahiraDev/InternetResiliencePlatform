#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const skip = new Set(['.git', 'node_modules', 'dist', '.turbo', 'coverage']);
const files = [];

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
};

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${relative(root, file)} is invalid JSON: ${error.message}`);
    return undefined;
  }
};

const isGitHubTokenRelevantPath = (rel) =>
  rel.startsWith('.github/') ||
  /\.(?:cjs|js|mjs|ts|tsx|json|ya?ml|sql|prisma|sh)$/.test(rel);

const githubTokenLegacyAssumptions = [
  /(?:GITHUB_TOKEN|GH_TOKEN|github.{0,40}token|installation.{0,40}token)[^\n]{0,160}\.length\s*(?:===|!==|==|!=)\s*40\b/i,
  /(?:GITHUB_TOKEN|GH_TOKEN|github.{0,40}token|installation.{0,40}token)[^\n]{0,160}(?:slice|substring|substr)\(\s*0\s*,\s*40\s*\)/i,
  /(?:GITHUB_TOKEN|GH_TOKEN|github.{0,40}token|installation.{0,40}token)[^\n]{0,160}(?:maxLength|minLength|length)\s*[:=]\s*40\b/i,
  /(?:github.{0,40}token|installation.{0,40}token)[^\n]{0,160}@db\.VarChar\(\s*40\s*\)/i,
];

walk(root);

for (const file of files) {
  const rel = relative(root, file);
  const text = readFileSync(file, 'utf8');

  if (/(^|\r?\n)(?:<{7}|={7}|>{7})(?:\r?\n|$)/.test(text)) {
    errors.push(`${rel} contains merge-conflict markers`);
  }

  if (rel.endsWith('.json')) readJson(file);

  if (isGitHubTokenRelevantPath(rel)) {
    for (const pattern of githubTokenLegacyAssumptions) {
      if (pattern.test(text)) {
        errors.push(`${rel} contains a legacy GitHub token length/truncation assumption; treat GitHub tokens as opaque values`);
        break;
      }
    }
  }
}

const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
for (const expected of ['apps/*', 'packages/*']) {
  if (!workspace.includes(expected)) errors.push(`pnpm-workspace.yaml missing ${expected}`);
}

const packages = files.filter((f) =>
  relative(root, f).match(/^(apps|packages)\/[^/]+\/package\.json$/),
);

const noTestExceptionsPath = join(root, 'docs/testing/no-test-exceptions.json');
const noTestExceptions = readJson(noTestExceptionsPath)?.exceptions ?? [];
const noTestExceptionNames = new Set(noTestExceptions.map((entry) => entry.package));

for (const artifact of ['package-lock.json', 'yarn.lock', 'bun.lockb']) {
  if (existsSync(join(root, artifact))) {
    errors.push(`forbidden package-manager artifact present: ${artifact}`);
  }
}

const rootPackage = readJson(join(root, 'package.json'));
if (!rootPackage?.engines?.node?.includes('>=24.0.0')) {
  errors.push('package.json must require Node >=24.0.0');
}

const names = new Map();
for (const file of packages) {
  const pkg = readJson(file);
  if (!pkg) continue;

  const rel = relative(root, file);

  if (!pkg.name) errors.push(`${rel} missing package name`);

  if (names.has(pkg.name)) {
    errors.push(`duplicate package name ${pkg.name}: ${names.get(pkg.name)} and ${rel}`);
  }

  names.set(pkg.name, rel);

  for (const script of ['build', 'lint', 'test', 'typecheck']) {
    if (!pkg.scripts?.[script]) errors.push(`${rel} missing ${script} script`);
  }

  const packageRoot = join(root, rel.replace(/\/package\.json$/, ''));
  const packageFiles = files.filter((candidate) => candidate.startsWith(`${packageRoot}/`));
  const testFiles = packageFiles.filter((candidate) =>
    /(^|\/)(src|test|tests)\/.*\.(test|spec)\.(ts|tsx|js)$/.test(relative(packageRoot, candidate)),
  );

  const testScript = pkg.scripts?.test ?? '';

  if (testScript.includes('--passWithNoTests')) {
    errors.push(`${pkg.name} uses unexplained --passWithNoTests in test script: ${testScript}`);
  }

  if (testScript.includes('--typecheck=false')) {
    errors.push(`${pkg.name} uses unexplained --typecheck=false in test script: ${testScript}`);
  }

  if (testFiles.length === 0 && !noTestExceptionNames.has(pkg.name)) {
    errors.push(`${pkg.name} has no test files and no docs/testing/no-test-exceptions.json entry`);
  }

  if (testFiles.length > 0 && testScript !== 'vitest run') {
    errors.push(`${pkg.name} has tests but non-standard test script: ${testScript}`);
  }

  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const dep of Object.keys(pkg[section] ?? {})) {
      if (
        dep.startsWith('@irp/') &&
        !names.has(dep) &&
        !packages.some((p) => readJson(p)?.name === dep)
      ) {
        errors.push(`${rel} references unknown workspace package ${dep}`);
      }
    }
  }
}

const examplesRoot = join(root, 'examples');
if (existsSync(examplesRoot)) {
  const exampleDirectories = readdirSync(examplesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const examplesReadme = join(examplesRoot, 'README.md');
  if (!existsSync(examplesReadme)) {
    errors.push('examples/README.md is missing');
  }

  for (const name of exampleDirectories) {
    const exampleRoot = join(examplesRoot, name);
    const readme = join(exampleRoot, 'README.md');
    if (!existsSync(readme)) {
      errors.push(`examples/${name} is missing README.md`);
    }

    const executableFiles = readdirSync(exampleRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:mjs|cjs|js|sh)$/.test(entry.name));
    if (executableFiles.length === 0) {
      errors.push(`examples/${name} has no executable entry point`);
    }
  }

  const smokeScript = join(root, 'scripts/examples-smoke.mjs');
  if (!existsSync(smokeScript)) {
    errors.push('scripts/examples-smoke.mjs is missing');
  }
}

const workflows = files.filter(
  (f) => relative(root, f).startsWith('.github/workflows/') && /\.ya?ml$/.test(f),
);

const workflowNames = new Map();

for (const file of workflows) {
  const rel = relative(root, file);
  const text = readFileSync(file, 'utf8');
  const match = text.match(/^name:\s*(.+)$/m);

  if (!match) {
    errors.push(`${rel} missing workflow name`);
  } else if (workflowNames.has(match[1])) {
    errors.push(`duplicate workflow name ${match[1]}`);
  } else {
    workflowNames.set(match[1], rel);
  }

  const hasCheckout = /uses:\s*actions\/checkout@v(?:4|5|6)(?:\b|$)/m.test(text);
  const hasTrustedArtifactHandoff =
    /uses:\s*actions\/download-artifact@v(?:4|5|6)(?:\b|$)/m.test(text) &&
    /run-id:\s*\$\{\{\s*github\.event\.workflow_run\.id\s*\}\}/m.test(text) &&
    /irp-source-\$\{\{\s*github\.event\.workflow_run\.head_sha\s*\}\}/m.test(text);

  if (!hasCheckout && !hasTrustedArtifactHandoff) {
    errors.push(`${rel} missing supported actions/checkout action or approved trusted artifact handoff`);
  }

  if (!/uses:\s*actions\/setup-node@v(?:4|5|6|7)(?:\b|$)/m.test(text)) {
    errors.push(`${rel} missing supported actions/setup-node action`);
  }

  if (!/uses:\s*pnpm\/action-setup@v(?:4|5|6)(?:\b|$)/m.test(text)) {
    errors.push(`${rel} missing supported pnpm/action-setup action`);
  }
}

for (const required of [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
]) {
  if (!statSync(join(root, required), { throwIfNoEntry: false })) {
    errors.push(`missing ${required}`);
  }
}

const turbo = spawnSync('pnpm', ['exec', 'turbo', 'run', 'build', '--dry=json'], {
  cwd: root,
  encoding: 'utf8',
});

if (turbo.status !== 0) {
  errors.push(`turbo graph validation failed: ${turbo.stderr || turbo.stdout}`);
}

if (errors.length) {
  console.error(`Repository validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Repository validation passed for ${packages.length} packages, ${workflows.length} workflows, and ${files.length} files.`,
);
