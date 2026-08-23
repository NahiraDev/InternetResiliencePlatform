#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const docsRoot = join(root, 'docs');
const errors = [];
const warnings = [];

const requiredFiles = [
  'README.md',
  'documentation-standards.md',
  'current-architecture.md',
  'architecture/README.md',
  'architecture/product-architecture.md',
  'architecture/product-roadmap-70-phases.md',
  'architecture/engineering-governance.md',
  'architecture/release-gates.md',
  'audits/documentation-audit-2026-08-23.md',
  'audits/phase-history-evidence-matrix.md',
  'phases/README.md',
];

for (const file of requiredFiles) {
  if (!existsSync(join(docsRoot, file))) errors.push(`missing canonical documentation file: docs/${file}`);
}

const walkMarkdown = (dir) => {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(full));
    else if (/\.(md|mdx)$/i.test(entry.name)) files.push(full);
  }
  return files;
};

const markdownFiles = walkMarkdown(docsRoot);
const staleTokens = [
  'docs/PRODUCT_ARCHITECTURE.md',
  'docs/PRODUCT_ROADMAP_70_PHASES.md',
  'docs/mobile-client.md',
  'docs/security-architecture.md',
  'headless-only',
  '48 phases',
];

for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8');
  for (const token of staleTokens) {
    if (content.includes(token)) {
      errors.push(`${relative(root, file)} contains stale documentation reference: ${token}`);
    }
  }

  const linkPattern = /\]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const target = match[1];
    if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const cleanTarget = target.split('#', 1)[0].split('?', 1)[0];
    if (!cleanTarget || cleanTarget.startsWith('mailto:')) continue;
    const base = join(file, '..');
    const resolved = join(base, cleanTarget);
    if (!existsSync(resolved)) errors.push(`${relative(root, file)} has broken relative link: ${target}`);
  }
}

const docsIndex = readFileSync(join(docsRoot, 'README.md'), 'utf8');
const requiredIndexLinks = [
  'audits/phase-history-evidence-matrix.md',
  'architecture/product-roadmap-70-phases.md',
  'phases/README.md',
];
for (const link of requiredIndexLinks) {
  if (!docsIndex.includes(`(${link})`)) warnings.push(`docs/README.md should expose canonical link: ${link}`);
}

const phaseMatrix = readFileSync(join(docsRoot, 'audits/phase-history-evidence-matrix.md'), 'utf8');
if (!phaseMatrix.includes('historical numbering drift')) {
  errors.push('phase-history-evidence-matrix.md must document historical numbering drift');
}
if (!phaseMatrix.includes('Until that mapping is complete')) {
  errors.push('phase-history-evidence-matrix.md must prohibit unverified historical completion claims');
}

const phasePlan = readFileSync(join(docsRoot, 'architecture/product-roadmap-70-phases.md'), 'utf8');
for (let phase = 0; phase <= 70; phase += 1) {
  const marker = `| ${phase} |`;
  if (!phasePlan.includes(marker)) errors.push(`70-phase plan is missing Phase ${phase}`);
}

const suspiciousPhaseFiles = markdownFiles.filter((file) => /phases[\\/]phase-\d+\.md$/i.test(file));
for (const file of suspiciousPhaseFiles) {
  const content = readFileSync(file, 'utf8');
  if (!/## (Status|Verification)/.test(content)) warnings.push(`${relative(root, file)} is missing a clear status/verification section`);
}

if (warnings.length) {
  for (const warning of warnings) console.warn(`DOC-WARN: ${warning}`);
}
if (errors.length) {
  for (const error of errors) console.error(`DOC-ERROR: ${error}`);
  process.exit(1);
}
console.log(`Documentation validation passed: ${markdownFiles.length} Markdown/MDX files inspected.`);
