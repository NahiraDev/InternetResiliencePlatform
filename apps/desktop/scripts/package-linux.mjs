import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('release/linux', { recursive: true });
writeFileSync(
  'release/linux/README.txt',
  'Packaging foundation: run electron-builder or forge in a release pipeline after signing configuration is added.\n',
);
globalThis.console.log(
  'Linux packaging foundation generated at apps/desktop/release/linux/README.txt',
);
