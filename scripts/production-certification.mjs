import { createHash, verify } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const gitHeadSha = async () => {
  try {
    return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd() })).stdout
      .toString()
      .trim();
  } catch {
    return undefined;
  }
};

/**
 * Content-derived fingerprint of the tracked source tree (excluding artifacts/).
 *
 * Unlike the HEAD commit SHA, this does not change merely because a new commit
 * was made — it only changes when tracked source content changes. That makes
 * the certification report and its sha256 reproducible for the same source
 * tree, and a clean checkout stays clean after running the gate.
 */
const sourceContentHash = async () => {
  try {
    const ls = (
      await execFileAsync('git', ['ls-files', '--full-name', '--', '.', ':!artifacts'], {
        cwd: process.cwd(),
        maxBuffer: 64 * 1024 * 1024,
      })
    ).stdout
      .toString()
      .split('\n')
      .filter((p) => p.length > 0)
      .sort();
    if (ls.length === 0) return undefined;
    const digest = createHash('sha256');
    for (const rel of ls) {
      const sha = (
        await execFileAsync('git', ['hash-object', rel], {
          cwd: process.cwd(),
          maxBuffer: 64 * 1024 * 1024,
        })
      ).stdout
        .toString()
        .trim();
      digest.update(`${rel}\n${sha}\n`);
    }
    return digest.digest('hex');
  } catch {
    return undefined;
  }
};

const root = process.cwd();
const contractPath = join(root, 'ops/release/production-certification.json');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const value = process.argv[i];
  if (value === '--require-complete') args.set('require-complete', true);
  else if (value.startsWith('--') && process.argv[i + 1] && !process.argv[i + 1].startsWith('--'))
    args.set(value.slice(2), process.argv[++i]);
}

const evidencePath = args.get('evidence');
const outputDir = args.get('output') ?? join(root, 'artifacts/production-certification');
const runtimeUrl = args.get('runtime-url');
const requireComplete = args.get('require-complete') === true;
const contract = JSON.parse(await readFile(contractPath, 'utf8'));
const failures = [];
const pending = [];
const checks = [];

const record = (id, status, detail) => {
  checks.push({ id, status, detail });
  if (status === 'fail') failures.push(`${id}: ${detail}`);
  if (status === 'pending') pending.push(`${id}: ${detail}`);
  console.log(`${status.toUpperCase()} ${id} — ${detail}`);
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hasSecretMaterial(value) {
  const text = JSON.stringify(value);
  return (
    /BEGIN (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY/i.test(text) ||
    /(?:password|secret|token|api[_-]?key)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}/i.test(text)
  );
}

async function probeRuntime(baseUrl) {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const fetchJson = async (path) => {
    const response = await fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/json' },
    });
    const body = await response.text();
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      json = { raw: body };
    }
    return { response, json };
  };

  const health = await fetchJson('/health');
  record(
    'runtime-health',
    health.response.ok && health.json.status === 'ok' ? 'pass' : 'fail',
    `HTTP ${health.response.status}`,
  );
  const ready = await fetchJson('/ready');
  record(
    'runtime-ready',
    ready.response.ok && ready.json.status === 'ready' ? 'pass' : 'fail',
    `HTTP ${ready.response.status}; status=${ready.json.status ?? 'unknown'}`,
  );
  const report = await fetchJson('/report');
  if (!report.response.ok || report.json.status !== 'passed') {
    record('runtime-scenario', 'fail', `runtime report status=${report.json.status ?? 'unknown'}`);
  } else {
    record('runtime-scenario', 'pass', 'latest deterministic runtime scenario passed');
  }
  return {
    observedAt: new Date().toISOString(),
    source: base,
    health: health.json,
    ready: ready.json,
    report: report.json,
  };
}

if (!existsSync(contractPath))
  record('contract', 'fail', 'production certification contract is missing');
else record('contract', 'pass', `schemaVersion=${contract.schemaVersion}`);

let evidence = null;
if (evidencePath) {
  try {
    evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    if (hasSecretMaterial(evidence))
      record('evidence-secret-scan', 'fail', 'possible secret material detected');
    else record('evidence-secret-scan', 'pass', 'no obvious secret material detected');
  } catch (error) {
    record(
      'evidence-bundle',
      'fail',
      `cannot read evidence bundle: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
} else {
  record('evidence-bundle', 'pending', 'no independently supplied evidence bundle was provided');
}

if (evidence) {
  const items = new Map(
    (Array.isArray(evidence.items) ? evidence.items : []).map((item) => [item.id, item]),
  );
  for (const id of contract.requiredEvidence) {
    const item = items.get(id);
    if (!item) {
      record(`evidence:${id}`, 'pending', 'required evidence item is absent');
      continue;
    }
    const missing = contract.requiredFields.filter(
      (field) => item[field] === undefined || item[field] === null || item[field] === '',
    );
    if (missing.length) {
      record(`evidence:${id}`, 'fail', `missing required fields: ${missing.join(', ')}`);
      continue;
    }
    if (item.status === 'pass') record(`evidence:${id}`, 'pass', `observed ${item.observedAt}`);
    else if (item.status === 'fail') record(`evidence:${id}`, 'fail', 'evidence explicitly failed');
    else record(`evidence:${id}`, 'pending', `status=${item.status}`);
  }

  const signature = evidence.signature;
  if (!signature?.algorithm || !signature?.publicKeyPem || !signature?.valueBase64) {
    record(
      'bundle-signature',
      'pending',
      'Ed25519 bundle signature is required for production certification',
    );
  } else if (signature.algorithm !== 'ed25519') {
    record('bundle-signature', 'fail', `unsupported signature algorithm: ${signature.algorithm}`);
  } else {
    const unsigned = { ...evidence };
    delete unsigned.signature;
    const payload = JSON.stringify(unsigned);
    const valid = verify(
      null,
      Buffer.from(payload),
      signature.publicKeyPem,
      Buffer.from(signature.valueBase64, 'base64'),
    );
    record(
      'bundle-signature',
      valid ? 'pass' : 'fail',
      valid ? 'Ed25519 signature verified' : 'invalid Ed25519 signature',
    );
  }
}

let runtimeEvidence = null;
if (runtimeUrl) {
  try {
    runtimeEvidence = await probeRuntime(runtimeUrl);
  } catch (error) {
    record('runtime-probe', 'fail', error instanceof Error ? error.message : String(error));
  }
} else {
  record(
    'runtime-probe',
    'pending',
    'runtime URL was not supplied; no live runtime evidence claimed',
  );
}

// Deterministic: use a content-derived fingerprint of the tracked source tree
// (excluding artifacts/) so the same source tree always produces identical report
// bytes, regardless of which commit the tree happens to be checked out on.
const headSha = (await sourceContentHash()) ?? (await gitHeadSha()) ?? 'unknown';

const verdict = failures.length ? 'FAIL' : pending.length ? 'PENDING' : 'PASS';
const evidenceSnapshot = {
  schemaVersion: 1,
  // Deterministic: pin generatedAt to a content-derived fingerprint so the same
  // source tree always produces identical report bytes (see sourceContentHash).
  generatedAt: headSha,
  verdict,
  commitSha: headSha,
  contractSha256: sha256(JSON.stringify(contract)),
  checks,
  runtimeEvidence,
  suppliedEvidence: evidence
    ? {
        itemCount: Array.isArray(evidence.items) ? evidence.items.length : 0,
        source: evidence.source ?? null,
      }
    : null,
};

await mkdir(outputDir, { recursive: true });
// Hash the exact bytes written so `sha256sum -c` verifies the published report.
const reportBytes = `${JSON.stringify(evidenceSnapshot, null, 2)}\n`;
await writeFile(join(outputDir, 'certification-report.json'), reportBytes, 'utf8');
await writeFile(
  join(outputDir, 'certification-report.sha256'),
  `${sha256(reportBytes)}  certification-report.json\n`,
  'utf8',
);

console.log(`\nPRODUCTION CERTIFICATION: ${verdict}`);
console.log(`Evidence report: ${join(outputDir, 'certification-report.json')}`);

if (requireComplete && verdict !== 'PASS') {
  console.error(
    'Production certification is required to be complete, but the verdict is not PASS.',
  );
  process.exitCode = verdict === 'FAIL' ? 1 : 2;
}
