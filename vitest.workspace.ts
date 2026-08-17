import { defineWorkspace } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('./', import.meta.url));
const currentWorkingDirectory = path.resolve(process.cwd());
const workspaceRoots = [
  path.join(repositoryRoot, 'apps'),
  path.join(repositoryRoot, 'packages'),
];

const isPackageExecution = workspaceRoots.some((root) => {
  const relative = path.relative(root, currentWorkingDirectory);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
});

export default defineWorkspace(
  isPackageExecution
    ? [currentWorkingDirectory]
    : [path.join(repositoryRoot, 'apps/*'), path.join(repositoryRoot, 'packages/*')],
);
