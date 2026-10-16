import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const sha = '013f3c9cc67149aa1fafd0b16f4ecea26ea9420f';
const workflow = readFileSync(
  new URL('../.github/workflows/release-gate.yml', import.meta.url),
  'utf8',
);
const marker = '      - name: Verify release commit and required workflow results\n';
const step = workflow.slice(workflow.indexOf(marker) + marker.length);
const script = step
  .slice(step.indexOf('        run: |\n') + '        run: |\n'.length)
  .split('\n')
  .map((line) => line.replace(/^ {10}/, ''))
  .join('\n');
const required = [
  'ci.yml',
  'system-assurance.yml',
  'linux-primary-device.yml',
  'runtime-lab.yml',
  'codeql.yml',
  'repository-deep-audit.yml',
  'public-runtime-lab.yml',
  'android-client.yml',
  'ios-client.yml',
  'ios-network-integration.yml',
  'macos-client.yml',
  'windows-client.yml',
];

function evaluate(overrides = {}, head = sha) {
  const directory = mkdtempSync(join(tmpdir(), 'irp-release-gate-'));
  try {
    writeFileSync(join(directory, 'git'), '#!/bin/sh\nprintf "%s\\n" "$MOCK_MAIN_SHA"\n', {
      mode: 0o755,
    });
    writeFileSync(
      join(directory, 'gh'),
      `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const url = process.argv[3];
if (url.includes('/git/ref/heads/main')) {
  console.log(process.env.MOCK_MAIN_SHA);
} else {
  const parsed = new URL(url, 'https://api.github.com');
  if (parsed.searchParams.get('head_sha') !== process.env.HEAD_SHA ||
      parsed.searchParams.get('event') !== 'push') process.exit(3);
  const workflow = parsed.pathname.match(/workflows\\/([^/]+)\\/runs$/)[1];
  appendFileSync(process.env.MOCK_QUERIES, workflow + '\\n');
  const overrides = JSON.parse(process.env.MOCK_RUNS);
  console.log(JSON.stringify({ workflow_runs: overrides[workflow] ??
    [{status: 'completed', conclusion: 'success'}] }));
}
`,
      { mode: 0o755 },
    );
    const queries = join(directory, 'queries.txt');
    writeFileSync(queries, '');
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 3000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'nimarahimloo/InternetResiliencePlatform',
        HEAD_SHA: head,
        MOCK_MAIN_SHA: sha,
        MOCK_RUNS: JSON.stringify(overrides),
        MOCK_QUERIES: queries,
      },
    });
    assert.equal(result.error, undefined, `gate must not poll: ${result.error}`);
    return {
      code: result.status,
      output: result.stdout + result.stderr,
      queries: readFileSync(queries, 'utf8').trim().split('\n'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('only passes after every mandatory workflow, including both iOS gates, succeeds', () => {
  const result = evaluate();
  assert.equal(result.code, 0);
  assert.match(result.output, /Release Gate: PASS/);
  assert.deepEqual([...result.queries].sort(), [...required].sort());
});

for (const status of ['in_progress', 'queued']) {
  test(`${status} public soak is BLOCKED immediately, never green or polled`, () => {
    const result = evaluate({ 'public-runtime-lab.yml': [{ status, conclusion: null }] });
    assert.equal(result.code, 1);
    assert.match(result.output, /BLOCKED public-runtime-lab.yml/);
    assert.doesNotMatch(result.output, /Release Gate: PASS/);
  });
}

test('missing required run is BLOCKED, not inferred from another SHA or event', () => {
  const result = evaluate({ 'public-runtime-lab.yml': [] });
  assert.equal(result.code, 1);
  assert.match(result.output, /BLOCKED public-runtime-lab.yml/);
});

for (const name of ['ios-client.yml', 'ios-network-integration.yml', 'codeql.yml']) {
  test(`${name} failure cannot produce release-green`, () => {
    const result = evaluate({ [name]: [{ status: 'completed', conclusion: 'failure' }] });
    assert.equal(result.code, 1);
    assert.match(result.output, new RegExp(`FAIL ${name.replaceAll('.', '\\.')}`));
    assert.doesNotMatch(result.output, /Release Gate: PASS/);
  });
}

test('a stale triggering SHA fails before requesting workflow evidence', () => {
  const result = evaluate({}, 'a'.repeat(40));
  assert.equal(result.code, 1);
  assert.match(result.output, /must certify the current main commit/);
});
