import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findConflictMarkers, scanCommittedConflictMarkers } from './conflict-markers.mjs';

/**
 * Regression test for the repository conflict-marker guard.
 *
 * Issue #466: generated assurance artifacts were merged with unresolved conflict
 * markers. The previous validator only detected bare seven-character marker
 * lines, so it missed the two most common git forms (`<<<<<<< HEAD`,
 * `>>>>>>> <branch>`) and the diff3 base marker (`||||||| base`).
 */
describe('conflict marker detection', () => {
  it('detects the standard git conflict block', () => {
    const text = [
      'line before',
      '<<<<<<< HEAD',
      'ours',
      '=======',
      'theirs',
      '>>>>>>> feature/branch',
      'line after',
    ].join('\n');

    const markers = findConflictMarkers(text);

    expect(markers.map((marker) => marker.line)).toEqual([2, 4, 6]);
    expect(markers.map((marker) => marker.marker)).toEqual([
      '<<<<<<< HEAD',
      '=======',
      '>>>>>>> feature/branch',
    ]);
  });

  it('detects nested conflict blocks and the diff3 base marker', () => {
    const text = [
      '<<<<<<< HEAD',
      '<<<<<<< HEAD',
      'inner ours',
      '=======',
      'inner theirs',
      '>>>>>>> other',
      '=======',
      'outer theirs',
      '>>>>>>> main',
    ].join('\n');

    expect(findConflictMarkers(text).length).toBe(6);

    const diff3 = ['<<<<<<< ours', '||||||| base', '=======', '>>>>>>> theirs'].join('\n');
    expect(findConflictMarkers(diff3).map((marker) => marker.marker)).toEqual([
      '<<<<<<< ours',
      '||||||| base',
      '=======',
      '>>>>>>> theirs',
    ]);
  });

  it('detects markers with CRLF line endings', () => {
    const text = ['<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> branch'].join('\r\n');

    expect(findConflictMarkers(text).length).toBe(3);
  });

  it('does not flag content that is not a conflict marker', () => {
    const text = [
      '========',
      '====',
      '<<<<<<<<',
      '>>>>>>>>',
      'prose mentioning <<<<<< and >>>>>> inline',
      'let x = a < b && c > d;',
      '||||||',
    ].join('\n');

    expect(findConflictMarkers(text)).toEqual([]);
  });

  it('flags the diff3 base marker', () => {
    expect(findConflictMarkers('||||||| base\n').map((marker) => marker.marker)).toEqual([
      '||||||| base',
    ]);
  });

  it('flags markers even inside a fenced code block', () => {
    // A merge conflict can land inside a fenced block in Markdown, so the
    // detector is deliberately strict and does not try to parse code fences.
    const text = ['```diff', '<<<<<<< HEAD', '=======', '>>>>>>> branch', '```'].join('\n');

    expect(findConflictMarkers(text).length).toBe(3);
  });
});

describe('committed conflict marker scan', () => {
  const withTempRepo = (run) => {
    const dir = mkdtempSync(join(tmpdir(), 'irp-conflict-scan-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', 'irp@example.invalid'], { cwd: dir });
      execFileSync('git', ['config', 'user.name', 'IRP Test'], { cwd: dir });
      mkdirSync(join(dir, 'artifacts'), { recursive: true });
      writeFileSync(
        join(dir, 'artifacts', 'broken.json'),
        '{\n<<<<<<< HEAD\n"value": 1\n=======\n"value": 2\n>>>>>>> other\n}\n',
        'utf8',
      );
      writeFileSync(join(dir, 'clean.txt'), 'no markers here\n', 'utf8');
      execFileSync('git', ['add', '--all'], { cwd: dir });
      execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: dir });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('reports committed files that still contain conflict markers', () => {
    withTempRepo((dir) => {
      const result = scanCommittedConflictMarkers(dir);

      expect(result.scanned).toBe(true);
      expect(result.files).toEqual(['artifacts/broken.json']);
    });
  });

  it('reports nothing for a clean committed tree', () => {
    withTempRepo((dir) => {
      execFileSync('git', ['rm', '--quiet', 'artifacts/broken.json'], { cwd: dir });
      execFileSync('git', ['commit', '--quiet', '-m', 'remove fixture'], { cwd: dir });

      const result = scanCommittedConflictMarkers(dir);

      expect(result.scanned).toBe(true);
      expect(result.files).toEqual([]);
    });
  });

  it('keeps this repository free of committed conflict markers', () => {
    const result = scanCommittedConflictMarkers(process.cwd());

    if (!result.scanned) {
      console.warn(`committed scan unavailable: ${result.reason}`);
      return;
    }

    expect(result.files).toEqual([]);
  });
});

/**
 * Docker Compose interpolates the whole of compose.yaml for every command, so each CI step that calls
 * it needs every `${VAR:?}` variable. Exports made inside scripts/docker-smoke.sh do not reach later
 * steps, which once broke the always() logs and cleanup steps.
 */
describe('CI Docker Compose step environment', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const keys = (block, indent) =>
    [...block.matchAll(new RegExp(`^ {${indent}}([A-Z][A-Z0-9_]*):`, 'gm'))].map((m) => m[1]);
  const envBlock = (text, indent) =>
    text.match(new RegExp(`^ {${indent}}env:\\n((?: {${indent + 2}}.*\\n)+)`, 'm'))?.[1] ?? '';

  const required = new Set(
    [...read('compose.yaml').matchAll(/\$\{([A-Z0-9_]+):\?/g)].map((m) => m[1]),
  );
  const workflow = read('.github/workflows/ci.yml').replace(/\r\n/g, '\n');
  const job = workflow.slice(workflow.indexOf('\n  validate:\n'));
  const jobEnv = keys(envBlock(job, 4), 6);
  const composeSteps = job
    .split(/^ {6}- name: /m)
    .filter((step) => /^ {8}run: docker compose /m.test(step));

  it('finds the compose requirements and the logs and cleanup steps', () => {
    expect(required).toContain('IRP_EMAIL_WEBHOOK_URL');
    expect(composeSteps.map((step) => step.split('\n')[0])).toEqual([
      'Show Docker Compose logs',
      'Remove Docker Compose runtime',
    ]);
  });

  it('gives each of those steps every required variable', () => {
    for (const step of composeSteps) {
      const available = new Set([...jobEnv, ...keys(envBlock(`${step}\n`, 8), 10)]);
      const missing = [...required].filter((name) => !available.has(name));
      expect(missing, step.split('\n')[0]).toEqual([]);
      expect(step).toMatch(/^ {8}if: always\(\)$/m);
    }
  });

  it('only ever supplies undeliverable .invalid email endpoints', () => {
    const urls = [...workflow.matchAll(/IRP_(?:EMAIL_WEBHOOK|PUBLIC_BASE)_URL: (\S+)/g)];
    expect(urls.length).toBeGreaterThan(0);
    for (const [, url] of urls) expect(new URL(url).hostname.endsWith('.invalid')).toBe(true);
  });
});
