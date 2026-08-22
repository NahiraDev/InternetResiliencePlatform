import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const examples = [
  ['network-measurement', 'examples/network-measurement/measure-dns.mjs', ['example.com']],
  ['dns-diagnostics', 'examples/dns-diagnostics/inspect.mjs', ['example.com']],
  ['failover', 'examples/failover/simulate.mjs'],
  ['autopilot', 'examples/autopilot/simulate.mjs'],
];

for (const [name, relativeScript, args = []] of examples) {
  const script = resolve(root, relativeScript);
  if (!existsSync(script)) {
    throw new Error(`Example ${name} is missing: ${relativeScript}`);
  }

  await runNode(script, args, name);
}

console.log(`Example smoke checks passed: ${examples.length}`);

function runNode(script, args, name) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`Example ${name} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}
