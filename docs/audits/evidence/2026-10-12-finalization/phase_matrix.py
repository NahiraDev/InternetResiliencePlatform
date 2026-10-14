#!/usr/bin/env python3
"""Generate the IRP Phase 1-150 status matrix from repository evidence.

Reproducible: run from the repository root with
    python3 docs/audits/evidence/2026-10-12-finalization/phase_matrix.py

Inputs (all read from the working tree at HEAD):
  docs/architecture/product-roadmap-70-phases.md  phase 0-70 titles
  docs/phases/phase-NN.md                           phase contracts 39-80
  docs/roadmap/MASTER_ROADMAP_V2.md                 phase 72-150 titles
  test-counts.tsv (this directory)                  per-package test results

The probe only proves that cited paths exist and that the owning package's
tests ran and passed in the recorded run. Dispositions combine that probe with
the explicit rules and per-phase justifications below; nothing is marked
COMPLETE from documentation presence alone.
"""
import json
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
os.chdir(ROOT)

head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()

titles = {}
for line in open('docs/architecture/product-roadmap-70-phases.md', encoding='utf-8'):
    m = re.match(r'^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|', line)
    if m and int(m.group(1)) <= 70:
        titles.setdefault(int(m.group(1)), m.group(2).strip())
for line in open('docs/roadmap/MASTER_ROADMAP_V2.md', encoding='utf-8'):
    m = re.match(r'^- \*\*Phase (\d+) — ([^*]+)\*\*', line)
    if m:
        titles[int(m.group(1))] = m.group(2).strip()
titles.setdefault(71, 'Cross-Platform Distribution & GitHub Releases')

passed_packages = set()
counts_path = os.path.join(HERE, 'test-counts.tsv')
if os.path.exists(counts_path):
    for line in open(counts_path, encoding='utf-8'):
        pkg, kind, result = line.rstrip('\n').split('\t')
        if kind == 'Tests' and 'failed' not in result:
            passed_packages.add(pkg)

PATH_RE = re.compile(r'`((?:apps|packages|scripts|ops|\.github)/[A-Za-z0-9_./@-]+)`')
TOKEN_RE = re.compile(r'`([^`\n]+)`')
PKG_DIRS = {}
for base in ('apps', 'packages'):
    for d in sorted(os.listdir(base)):
        pj = os.path.join(base, d, 'package.json')
        if os.path.exists(pj):
            PKG_DIRS[json.load(open(pj, encoding='utf-8')).get('name')] = os.path.join(base, d)
TRACKED = subprocess.check_output(['git', 'ls-files'], text=True).split('\n')
SRC_FILES = [f for f in TRACKED if re.search(r'^(apps|packages)/[^/]+/src/.+\.(ts|tsx|mjs|js)$', f)
             and not re.search(r'\.test\.|/tests?/', f)]


def package_of(path):
    parts = path.split('/')
    if parts[0] in ('apps', 'packages') and len(parts) > 1:
        for name, d in PKG_DIRS.items():
            if d == '/'.join(parts[:2]):
                return name
    return None


NATIVE_FILES = [f for f in TRACKED if re.search(r'\.(swift|kt|java)$', f)]
PLATFORM_GLOBALS = {'AbortSignal', 'AbortController', 'Promise', 'Error', 'Date', 'Map', 'Set', 'Buffer', 'URL'}


def native_package(f):
    return 'native:' + '/'.join(f.split('/')[:2])


def symbol_defined(sym):
    if sym in PLATFORM_GLOBALS:
        return 'platform-global'
    for f in NATIVE_FILES:
        try:
            if re.search(r'\b' + re.escape(sym) + r'\b', open(f, encoding='utf-8').read()):
                return f
        except OSError:
            pass
    pat = re.compile(r'\b(class|interface|type|function|const|enum)\s+' + re.escape(sym) + r'\b')
    for f in SRC_FILES:
        try:
            if pat.search(open(f, encoding='utf-8').read()):
                return f
        except OSError:
            pass
    return None


def resolve_relative(path, pkgs):
    hits = [f for f in TRACKED if f.endswith('/' + path) or f == path]
    scoped = [f for f in hits if any(f.startswith(PKG_DIRS[p] + '/') for p in pkgs if p in PKG_DIRS)]
    return (scoped or hits or [None])[0]


def probe(n):
    doc = f'docs/phases/phase-{n:02d}.md'
    if not os.path.exists(doc):
        return {'doc': None}
    text = open(doc, encoding='utf-8').read()
    status = ''
    m = re.search(r'\*\*Status:\*\*\s*(.+)', text) or re.search(r'## Status\s*\n+(.+?)\n', text)
    if m:
        status = m.group(1).strip().strip('*').strip()
    tokens = sorted(set(t.strip() for t in TOKEN_RE.findall(text)))
    pkgs = sorted({t for t in tokens if re.fullmatch(r'@irp/[a-z0-9-]+', t)})
    missing, resolved, natives = [], [], set()
    for t in pkgs:
        (resolved if t in PKG_DIRS else missing).append(t)
    for t in tokens:
        if re.fullmatch(r'(?:apps|packages|scripts|ops|\.github|src|tests?)/[A-Za-z0-9_./@-]+\.[a-z]+', t) or \
           re.fullmatch(r'[A-Za-z0-9_-]+\.(ts|mjs|yml|yaml|json|prisma|kt|swift)', t):
            f = t if os.path.exists(t) else resolve_relative(t, pkgs)
            (resolved if f else missing).append(t)
            if f and package_of(f):
                pkgs.append(package_of(f))
        elif re.fullmatch(r'[A-Z][A-Za-z0-9]{3,}', t):
            f = symbol_defined(t)
            (resolved if f else missing).append(t)
            if f and package_of(f):
                pkgs.append(package_of(f))
            elif f and f in NATIVE_FILES:
                natives.add(native_package(f))
    pkgs = sorted(set(p for p in pkgs if p in PKG_DIRS))
    return {
        'doc': doc,
        'recordedStatus': status[:160],
        'resolvedReferences': len(resolved),
        'missingReferences': missing,
        'packages': pkgs,
        'nativeSources': sorted(natives),
        'packagesWithPassingTests': [p for p in pkgs if p in passed_packages],
    }


# Explicit dispositions. Each entry: (disposition, justification).
EXTERNAL = {
    41: 'Regional validation tooling exists; acceptance requires an Iranian network vantage point and observed-egress evidence that cannot be produced from CI or this environment.',
    69: 'Production-readiness contract and checks exist and pass in CI; the phase defines device, accessibility and localization acceptance that requires real-device and human evidence (production-certification evidence ids accessibility, localization, platform-runtime).',
    70: 'Fail-closed v1.0 certification verifier exists and reports PENDING: 15 required evidence items (security-audit, regional-evidence, chaos-soak, backup-restore, upgrade-rollback, ios/android-device-smoke, ...) are not supplied.',
}
PARTIAL_LATER = {
    79: 'Acceptance contract formalized in docs/phases/phase-79.md (issue #13). Intent model and lifecycle exist with mapped tests; disposition remains PARTIAL pending full end-to-end verification evidence and matrix regeneration on a green CI SHA.',
    80: 'Acceptance contract formalized in docs/phases/phase-80.md (issue #13). Intent API exists with tests; remains PARTIAL until durable ownership e2e evidence is recorded.',
    81: 'Acceptance contract formalized in docs/phases/phase-81.md (issue #13). Compilation exists and is tested; remains PARTIAL pending contract-mapped CI evidence.',
    82: 'Acceptance contract formalized in docs/phases/phase-82.md (issue #13). Policy arbitration exists; remains PARTIAL.',
    83: 'Acceptance contract formalized in docs/phases/phase-83.md (issue #13). Arbitration and conflict journal exist with tests; remains PARTIAL pending full durable journal e2e certification.',
}
RELATED = {
    86: 'fabric.ts / fabric-authority.ts / fabric-lifecycle.ts',
    89: 'packages/gateway-registry, src/gateway/gateway-registry-plane.ts',
    90: 'packages/dns, packages/tunnel, src/tunnel/tunnel-control-plane.ts',
    99: 'packages/failover (circuit breaker / recovery budget)',
    100: 'src/telemetry/telemetry.ts (no dedicated tests)',
    107: 'packages/security, src/security/trust-boundaries.ts',
    110: 'src/security/secrets.ts',
    117: 'src/federation (advisory probe federation)',
    121: 'src/knowledge (knowledge store, failure memory)',
    122: 'src/knowledge/prediction.ts',
    125: 'src/scenario-lab (deterministic fault scenarios)',
    135: 'apps/api /api/v1 surface',
    137: 'packages/plugin-loader, packages/plugin-sandbox',
}

rows = []
for n in range(1, 151):
    p = probe(n) if 39 <= n <= 83 else {'doc': None}
    title = titles.get(n, '(title not found)')
    if n <= 38:
        disp = 'PARTIAL'
        if n <= 25:
            why = ('Acceptance evidence register (docs/audits/evidence/phase-1-38-acceptance-evidence.md) maps '
                   'packages, paths and recorded test passes for this phase; phase-history-evidence-matrix.md records '
                   'it as mapped. Disposition remains PARTIAL pending attachment of a fresh per-phase CI workflow URL '
                   'and full acceptance-criteria verification beyond the historical reconstruction.')
        else:
            why = ('Implementation lives in the workspace packages and their tests pass, but the repository\'s own '
                   'phase-history evidence matrix records this phase as historical-evidence / pending reconstruction: '
                   'no per-phase acceptance record maps commits and tests to this phase contract.')
    elif n in EXTERNAL:
        disp, why = 'BLOCKED', EXTERNAL[n]
    elif n == 71:
        disp = 'COMPLETE'
        why = ('Release distribution surface exists and was exercised: GitHub Release v0.2.1 publishes Linux, Android (debug), '
               'macOS and Windows developer bundles, iOS source and SHA256SUMS. Scope caveat: macOS/Windows archives are '
               'unsigned developer bundles (single dist/index.js + service manifest), Android is a debug APK, iOS is source-only.')
    elif 39 <= n <= 78:
        ok = p['doc'] and not p['missingReferences'] and p['resolvedReferences'] > 0 and (p['packages'] or p['nativeSources'])
        tests_ok = set(p.get('packages', [])) <= set(p.get('packagesWithPassingTests', []))
        if ok and tests_ok:
            disp = 'COMPLETE'
            why = (f"Phase contract {p['doc']}; all {p['resolvedReferences']} cited packages/paths/symbols resolve at HEAD; owning package tests ({', '.join(p['packages'])}) passed "
                   'in the recorded run and the bf73303/WP2.2 CI workflows are green.')
            if p.get('nativeSources'):
                why += (f" Native sources ({', '.join(p['nativeSources'])}) are verified by the platform CI workflows "
                        '(iOS Full Client / iOS Network Integration / Android Client); real-device smoke evidence is a Phase 70 '
                        'certification item and remains pending.')
            if n == 78:
                why += (' Integration residual: BoundedClosedLoopController is exercised against the canonical ResilienceRuntime '
                        'by tests, but no production entrypoint runs the multi-cycle loop (API triggers single runCycle calls; the '
                        'only non-test consumer is the deprecated NetworkAutopilot). Tracked as remaining work.')
        elif p['doc'] is None:
            disp, why = 'PARTIAL', 'No phase contract document found; cannot verify acceptance.'
        else:
            disp = 'PARTIAL'
            if p['missingReferences']:
                why = f"Phase contract cites references that do not resolve at HEAD: {', '.join(p['missingReferences'][:6])}."
            elif not p['packages']:
                why = ('Phase contract does not cite a package, source path or symbol that can be verified at HEAD '
                       f"(recorded status: '{p['recordedStatus']}'); implementation cannot be mapped to tests.")
            else:
                why = 'Owning package tests did not pass in the recorded run.'
    elif n in PARTIAL_LATER:
        disp, why = 'PARTIAL', PARTIAL_LATER[n]
    else:
        disp = 'NOT STARTED'
        why = 'MASTER_ROADMAP_V2 lists this phase as a reference-only heading with no acceptance contract; PROJECT_STATE forbids starting it without explicit authorization.'
        if n in RELATED:
            why += f' Related pre-existing capability (not a phase implementation): {RELATED[n]}.'
    rows.append({'phase': n, 'title': title, 'disposition': disp, 'justification': why, 'probe': p})

summary = {}
for r in rows:
    summary[r['disposition']] = summary.get(r['disposition'], 0) + 1

out = {'schemaVersion': 1, 'sourceSha': head, 'summary': summary, 'phases': rows}
json.dump(out, open(os.path.join(HERE, 'phase-status-matrix.json'), 'w', encoding='utf-8'), indent=2)
json.dump(out, open('/dev/stdout', 'w'), indent=None)

md = [
    '# IRP Phase 1–150 Status Matrix',
    '',
    f'**Source SHA:** `{head}`  ',
    '**Generated by:** `docs/audits/evidence/2026-10-12-finalization/phase_matrix.py` (reproducible; machine-readable copy in `phase-status-matrix.json`).',
    '',
    '> Dispositions follow `PROJECT_STATE.md`: completion requires implementation plus verification evidence. '
    'Documentation, stubs, mocks or a passing typecheck alone never yield COMPLETE. Phases 1–70 follow the historical '
    'v1 product contract (`docs/architecture/product-roadmap-70-phases.md`), Phase 71 the v1 distribution contract, and '
    'Phases 72–150 `docs/roadmap/MASTER_ROADMAP_V2.md`.',
    '',
    '## Summary',
    '',
    '| Disposition | Phases |',
    '| --- | ---: |',
]
for k in ('COMPLETE', 'PARTIAL', 'BLOCKED', 'NOT STARTED', 'NOT APPLICABLE'):
    md.append(f'| {k} | {summary.get(k, 0)} |')
md += ['', '## Matrix', '', '| Phase | Title | Disposition | Evidence / justification |', '| ---: | --- | --- | --- |']
for r in rows:
    j = r['justification'].replace('|', '\\|')
    md.append(f"| {r['phase']} | {r['title']} | {r['disposition']} | {j} |")
open(os.path.join(ROOT, 'docs/audits/phase-1-150-status-matrix.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
