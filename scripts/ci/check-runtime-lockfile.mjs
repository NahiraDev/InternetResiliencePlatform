import { readFile } from 'node:fs/promises';

const lockfile = await readFile('pnpm-lock.yaml', 'utf8');
const required = [
  "'@irp/internet-intelligence-agent': workspace:*",
  "'@irp/network-intelligence': workspace:*",
];

const missing = required.filter((entry) => !lockfile.includes(entry));
if (missing.length) {
  console.error('pnpm-lock.yaml is missing canonical runtime workspace dependency specifiers:');
  for (const entry of missing) console.error(`- ${entry}`);
  process.exit(1);
}

console.log('Canonical runtime workspace dependencies are present in pnpm-lock.yaml.');
