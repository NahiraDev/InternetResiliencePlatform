import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/ios-client.yml', import.meta.url),
  'utf8',
);
const marker = '      - name: Initialize and verify iOS simulator runtime\n';
assert.ok(workflow.includes(marker));
const step = workflow.split(marker)[1].split('\n      - name:')[0];
const script = step
  .split('        run: |\n')[1]
  .split('\n')
  .map((line) => line.replace(/^ {10}/, ''))
  .join('\n');

function evaluate(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'irp-ios-simulator-'));
  try {
    const log = join(directory, 'commands.log');
    writeFileSync(log, '');
    writeFileSync(
      join(directory, 'xcrun'),
      `#!${process.execPath}
import { appendFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
const options = JSON.parse(process.env.MOCK_OPTIONS);
appendFileSync(process.env.MOCK_LOG, 'xcrun ' + args.join(' ') + '\\n');
if (args.join(' ') === 'simctl list') {
  if (options.initFails) process.exit(70);
  console.log('CoreSimulator initialized');
} else if (args[0] === '--sdk') {
  if (options.sdkFails) process.exit(1);
  console.log('18.4');
} else if (args.join(' ') === 'simctl list runtimes --json') {
  if (options.listFails) process.exit(70);
  if (options.invalidJson) { console.log('{bad-json'); process.exit(0); }
  const installed = existsSync(process.env.MOCK_INSTALLED);
  const present = options.present || (installed && !options.installDoesNotProvideRuntime);
  console.log(JSON.stringify({runtimes: [{
    identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-4',
    version: present ? (options.version ?? '18.4') : '18.5',
    isAvailable: options.available ?? true,
  }]}));
} else if (args.join(' ') === 'simctl list runtimes') {
  console.log('iOS runtime inventory');
} else process.exit(2);
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(directory, 'xcodebuild'),
      `#!${process.execPath}
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const options = JSON.parse(process.env.MOCK_OPTIONS);
appendFileSync(process.env.MOCK_LOG, 'xcodebuild ' + args.join(' ') + '\\n');
if (args[0] === '-downloadPlatform') {
  if (options.downloadFails) process.exit(70);
  writeFileSync(process.env.MOCK_INSTALLED, 'installed');
} else if (args[0] !== '-showsdks') process.exit(2);
`,
      { mode: 0o755 },
    );
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        RUNNER_TEMP: directory,
        MOCK_LOG: log,
        MOCK_INSTALLED: join(directory, 'installed'),
        MOCK_OPTIONS: JSON.stringify(options),
      },
    });
    assert.equal(result.error, undefined);
    return {
      code: result.status,
      output: result.stdout + result.stderr,
      commands: readFileSync(log, 'utf8').trim().split('\n'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('initializes immediately after toolchain selection and preserves mandatory build', () => {
  assert.match(workflow, /swift --version\n\n      - name: Initialize and verify/);
  assert.equal(
    script
      .trim()
      .split('\n')
      .find((line) => line.startsWith('xcrun')),
    'xcrun simctl list',
  );
  assert.match(workflow, /- name: Build iOS app and packet tunnel \(simulator, unsigned\)/);
  assert.match(workflow, /-destination 'generic\/platform=iOS Simulator'/);
});

test('an available matching runtime avoids download', () => {
  const result = evaluate({ present: true });
  assert.equal(result.code, 0);
  assert.equal(result.commands[0], 'xcrun simctl list');
  assert.ok(!result.commands.some((line) => line.includes('-downloadPlatform')));
});

test('a missing runtime is installed once for the selected SDK and verified', () => {
  const result = evaluate();
  assert.equal(result.code, 0);
  assert.deepEqual(
    result.commands.filter((line) => line.includes('-downloadPlatform')),
    ['xcodebuild -downloadPlatform iOS -buildVersion 18.4'],
  );
  assert.equal(
    result.commands.filter((line) => line === 'xcrun simctl list runtimes --json').length,
    2,
  );
});

test('download failure is propagated with no retry or success', () => {
  const result = evaluate({ downloadFails: true });
  assert.equal(result.code, 70);
  assert.equal(result.commands.filter((line) => line.includes('-downloadPlatform')).length, 1);
  assert.ok(!result.commands.includes('xcodebuild -showsdks'));
});

test('successful download without a usable matching runtime fails closed', () => {
  const result = evaluate({ installDoesNotProvideRuntime: true });
  assert.equal(result.code, 1);
  assert.match(result.output, /Required iOS 18.4 simulator runtime is not available/);
});

test('an unavailable runtime is not treated as usable', () => {
  const result = evaluate({ present: true, available: false });
  assert.equal(result.code, 1);
});

for (const option of ['initFails', 'sdkFails', 'listFails', 'invalidJson']) {
  test(`${option} stops preflight instead of concealing a tooling failure`, () => {
    const result = evaluate({ [option]: true });
    assert.notEqual(result.code, 0);
    assert.ok(!result.commands.some((line) => line.includes('-downloadPlatform')));
  });
}
