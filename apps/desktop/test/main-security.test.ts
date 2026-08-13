import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('Electron window security', () => {
  const main = readFileSync(new URL('../src/main/main.ts', import.meta.url), 'utf8');
  const preload = readFileSync(new URL('../src/preload/preload.ts', import.meta.url), 'utf8');
  it('enables secure BrowserWindow defaults', () => {
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('sandbox: true');
    expect(main).toContain('Content-Security-Policy');
  });
  it('blocks arbitrary navigation and popup creation', () => {
    expect(main).toContain('will-navigate');
    expect(main).toContain('setWindowOpenHandler');
    expect(main).toContain("action: 'deny'");
  });
  it('does not expose ipcRenderer directly', () => {
    expect(preload).toContain('contextBridge.exposeInMainWorld');
    expect(preload).not.toContain("exposeInMainWorld('ipcRenderer'");
  });
});
