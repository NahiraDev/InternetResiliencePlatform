import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { verifyPreviewPublication } from './docker-publication-policy.mjs';

const sha = '14499f942b679708fc63d0248c1a6d5c5c5f5577';
const image = 'ghcr.io/nimarahimloo/internetresilienceplatform';
const preview = `${image}:sha-${sha.slice(0, 7)}`;
const workflow = readFileSync(
  new URL('../.github/workflows/docker-publish.yml', import.meta.url),
  'utf8',
);

test('a successful main-branch CI commit may publish a SHA preview, never production approval', () => {
  const policy = verifyPreviewPublication({ image, sourceSha: sha, tags: preview });
  assert.equal(policy.publicationClass, 'developer-preview');
  assert.equal(policy.latestPromotion, 'BLOCKED');
  assert.equal(policy.sourceSha, sha);
});

for (const tags of [
  `${image}:latest`,
  `${preview}\n${image}:latest`,
  `${image}:v1.0.0`,
  `${image}:sha-abcdef0`,
  'ghcr.io/another/repository:sha-14499f9',
  '',
  `${preview}\n${preview}`,
]) {
  test(`rejects tags outside the exact-source preview policy: ${tags || '(empty)'}`, () => {
    assert.throws(
      () => verifyPreviewPublication({ image, sourceSha: sha, tags }),
      /Only developer-preview.*Latest promotion is BLOCKED/,
    );
  });
}

test('requires a full source SHA, not a tag or abbreviated claim', () => {
  assert.throws(
    () => verifyPreviewPublication({ image, sourceSha: '14499f9', tags: preview }),
    /exact full source commit SHA/,
  );
});

test('metadata cannot implicitly or explicitly introduce latest', () => {
  const metadata = workflow
    .split('      - name: Extract Docker metadata\n')[1]
    .split('\n      - name:')[0];
  assert.match(metadata, /flavor:\s*\|\s*\n\s*latest=false/);
  assert.match(metadata, /type=sha,prefix=sha-,format=short/);
  assert.doesNotMatch(metadata, /value=latest|enable=.*certif/i);
  assert.match(metadata, /org.opencontainers.image.revision=\$\{\{ steps.source.outputs.sha \}\}/);
});

test('policy is enforced before pushing; provenance, SBOM, signing and digest remain mandatory', () => {
  assert.ok(
    workflow.indexOf('Enforce developer-preview tag policy') <
      workflow.indexOf('Build and push Docker image'),
  );
  assert.match(workflow, /node --test scripts\/docker-publication-policy.test.mjs/);
  assert.match(workflow, /node scripts\/docker-publication-policy.mjs/);
  assert.match(workflow, /provenance: true/);
  assert.match(workflow, /sbom: true/);
  assert.match(workflow, /cosign sign --yes "\$\{image_tag\}@\$\{DIGEST\}"/);
  assert.match(workflow, /Signed image digest:/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.doesNotMatch(workflow, /continue-on-error:|\|\| true/);
});

function verifySource({ local = sha, main = sha, gated = sha } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'irp-docker-policy-'));
  try {
    writeFileSync(join(directory, 'git'), '#!/bin/sh\nprintf "%s\\n" "$MOCK_LOCAL_SHA"\n', {
      mode: 0o755,
    });
    writeFileSync(join(directory, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$MOCK_MAIN_SHA"\n', {
      mode: 0o755,
    });
    const output = join(directory, 'output');
    writeFileSync(output, '');
    const step = workflow
      .split('      - name: Verify successful main CI commit\n')[1]
      .split('\n      - name:')[0];
    const script = step.split('        run: |\n')[1].replace(/^ {10}/gm, '');
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 3000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'nimarahimloo/InternetResiliencePlatform',
        GATED_SHA: gated,
        GITHUB_OUTPUT: output,
        MOCK_LOCAL_SHA: local,
        MOCK_MAIN_SHA: main,
      },
    });
    assert.equal(result.error, undefined);
    return { code: result.status, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('publication source must match both current main and the triggering CI SHA', () => {
  assert.deepEqual(verifySource(), { code: 0, output: `sha=${sha}\nshort_sha=14499f9\n` });
  for (const mismatch of [
    { local: 'a'.repeat(40) },
    { main: 'a'.repeat(40) },
    { gated: 'a'.repeat(40) },
  ]) {
    const result = verifySource(mismatch);
    assert.equal(result.code, 1);
    assert.equal(result.output, '');
  }
});

test('an environment flag claiming certification cannot authorize latest', () => {
  const result = spawnSync(process.execPath, ['scripts/docker-publication-policy.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      IMAGE: image,
      SOURCE_SHA: sha,
      TAGS: `${image}:latest`,
      PRODUCTION_CERTIFIED: 'true',
      CI_GATE_PASSED: 'true',
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Latest promotion is BLOCKED/);
});
