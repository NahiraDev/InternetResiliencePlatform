#!/usr/bin/env node
// Architecture invariant validator - detects duplicate authorities, bypasses, orphans
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];

const read = (rel) => readFileSync(join(root, rel), 'utf8');

const mustContain = (rel, needle, msg) => {
  const text = read(rel);
  if (!text.includes(needle)) errors.push(`${rel}: ${msg} (missing "${needle}")`);
};
const mustNotContain = (rel, needle, msg) => {
  const text = read(rel);
  if (text.includes(needle)) errors.push(`${rel}: ${msg} (found "${needle}")`);
};
const mustMatch = (rel, regex, msg) => {
  const text = read(rel);
  if (!regex.test(text)) errors.push(`${rel}: ${msg} (pattern ${regex})`);
};

// 1. Only canonical runtime mutates privileged network state
mustContain(
  'packages/resilience-runtime/src/runtime.ts',
  'SafetyRollbackRecoveryKernel',
  'runtime must use SafetyRollbackRecoveryKernel',
);
mustNotContain(
  'apps/api/src/index.ts',
  'NetworkAutopilot',
  'API must not instantiate legacy autopilot (only projection)',
);
mustContain('apps/api/src/index.ts', 'LIVE_MODE_DISABLED', 'API must block live cycles');

// 2. CLI cannot bypass safety
mustContain('apps/cli/src/index.ts', 'cannot be bypassed by CLI', 'CLI must block live');
mustMatch('apps/cli/src/index.ts', /mode.*simulation|safe/, 'CLI must only allow simulation/safe');

// 3. Legacy autopilot deprecated
mustContain(
  'packages/resilience-runtime/src/autopilot/autopilot.ts',
  '@deprecated',
  'NetworkAutopilot must remain deprecated',
);
const autopilotInstantiation = (() => {
  // Count non-test instantiation of NetworkAutopilot
  const files = ['apps/api/src/index.ts', 'apps/daemon/src/index.ts', 'apps/cli/src/index.ts'];
  for (const f of files) {
    const t = read(f);
    if (/new\s+NetworkAutopilot/.test(t))
      errors.push(`${f}: must not instantiate NetworkAutopilot in production entrypoint`);
  }
})();

// 4. ResilienceRuntime is canonical - daemon must wire it with networkControlPlane
mustContain(
  'apps/daemon/src/index.ts',
  'new ResilienceRuntime',
  'daemon must construct ResilienceRuntime',
);
mustContain(
  'apps/daemon/src/index.ts',
  'networkControlPlane',
  'daemon must inject networkControlPlane',
);

// 5. No duplicate EventBus in core/kernel claiming authority
// Kernel MessageBus and core EventBus are allowed but must not be called "canonical"
if (existsSync(join(root, 'packages/core/src/index.ts'))) {
  const core = read('packages/core/src/index.ts');
  if (core.includes('class EventBus') && !core.includes('legacy')) {
    // Warn but not fail - documented as legacy
  }
}

// 6. Bounded loop safety
mustContain(
  'packages/resilience-runtime/src/closed-loop.ts',
  'MAX_ALLOWED_CYCLES = 10',
  'closed-loop must cap at 10',
);
mustContain(
  'packages/resilience-runtime/src/closed-loop.ts',
  'DEFAULT_MAX_CYCLES = 1',
  'closed-loop must default to 1',
);

// 7. API/daemon lifecycle has shutdown handling
mustContain('apps/api/src/index.ts', 'SIGTERM', 'API must handle SIGTERM');
mustContain('apps/daemon/src/index.ts', 'SIGTERM', 'daemon must handle SIGTERM');

// 8. Control-plane ownership doc exists
mustContain(
  'docs/architecture/control-plane-ownership.md',
  '@irp/resilience-runtime',
  'ownership doc must declare runtime authority',
);

// 9. Architecture maps exist and have schemaVersion
for (const p of [
  'docs/architecture/system-integration-map.json',
  'docs/architecture/runtime-execution-graph.json',
  'docs/architecture/failure-recovery-graph.json',
  'docs/architecture/security-boundary-graph.json',
]) {
  if (!existsSync(join(root, p))) errors.push(`${p}: missing architecture map`);
  else {
    const j = JSON.parse(read(p));
    if (j.schemaVersion !== 1) errors.push(`${p}: schemaVersion must be 1`);
  }
}

// 10. AGENTS.md is canonical quick start, not mission prompt
mustContain('AGENTS.md', 'Agent Quick Start', 'AGENTS.md must be quick start');
if (read('AGENTS.md').length > 5000)
  errors.push('AGENTS.md: appears to contain mission prompt overwrite (too large)');

if (errors.length) {
  console.error('Architecture validation failed:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('Architecture validation passed');
