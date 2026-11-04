/**
 * Git/diff3 conflict-marker detection shared by repository validation and its
 * regression test.
 *
 * An unresolved merge conflict is written by git as exactly seven marker
 * characters at the start of a line:
 *
 *   <<<<<<< [label]   conflict start
 *   ||||||| [label]   diff3 base section (`git merge --diff3`)
 *   =======           conflict separator
 *   >>>>>>> [label]   conflict end
 *
 * Rules (mirroring `git diff --check`, which reports "leftover conflict marker"):
 *
 * - Start/base/end markers are exactly seven characters and may be followed by a
 *   label that is separated from the marker by whitespace.
 * - The separator is exactly seven characters and may only be followed by
 *   whitespace.
 * - Nothing else is a conflict marker. Longer runs (`========` used as an ASCII
 *   rule), shorter runs, and markers that are not at the start of a line are not
 *   conflicts and must never fail repository validation.
 *
 * The detection is intentionally stricter than a naive "seven angle brackets
 * anywhere" search so that documentation, ASCII art and generated assets cannot
 * fail the gate by accident, while still covering every marker form git can
 * write.
 */
import { spawnSync } from 'node:child_process';

/** JavaScript source for the line-anchored conflict-marker grammar. */
const CONFLICT_MARKER_SOURCE = '^(?:<{7}|\\|{7}|>{7})(?:[ \\t][^\\r\\n]*)?\\r?$|^={7}[ \\t]*\\r?$';

/**
 * POSIX ERE equivalent of {@link CONFLICT_MARKER_SOURCE}, used by `git grep`
 * for the committed-tree scan. `[[:space:]]` keeps the separator tolerant of
 * CRLF line endings.
 */
export const CONFLICT_MARKER_GREP_PATTERN = '^(<{7}|[|]{7}|>{7})( .*)?$|^={7}[[:space:]]*$';

const countNewlines = (value) => {
  let count = 0;
  for (const char of value) if (char === '\n') count += 1;
  return count;
};

/**
 * Detect conflict markers in a text payload.
 *
 * @param {string} text file content
 * @returns {{ line: number, marker: string }[]} one entry per marker line
 */
export function findConflictMarkers(text) {
  const regex = new RegExp(CONFLICT_MARKER_SOURCE, 'gm');
  const found = [];
  let cursor = 0;
  let line = 0;

  for (const match of text.matchAll(regex)) {
    line += countNewlines(text.slice(cursor, match.index));
    cursor = match.index;
    found.push({ line: line + 1, marker: match[0].replace(/\r$/, '') });
  }

  return found;
}

/**
 * Scan the committed tree for conflict markers.
 *
 * The working-tree scan performed by the repository validator only sees what is
 * on disk. This scan inspects the committed content of `HEAD`, so a conflict
 * marker that was committed and then locally cleaned up still fails validation.
 *
 * @param {string} cwd repository root
 * @returns {{ scanned: boolean, files: string[], reason?: string }}
 */
export function scanCommittedConflictMarkers(cwd = process.cwd()) {
  const result = spawnSync(
    'git',
    ['grep', '-l', '-I', '-E', CONFLICT_MARKER_GREP_PATTERN, 'HEAD', '--', '.'],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.error) {
    return { scanned: false, files: [], reason: result.error.message };
  }

  if (result.status !== 0 && result.status !== 1) {
    return {
      scanned: false,
      files: [],
      reason: (result.stderr || `git grep exited with ${result.status}`).trim(),
    };
  }

  const files = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('HEAD:') ? line.slice('HEAD:'.length) : line));

  return { scanned: true, files };
}
