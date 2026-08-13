declare module 'electron' {
  export const app: {
    isPackaged: boolean;
    whenReady(): Promise<void>;
    getVersion(): string;
    getAppPath(): string;
    quit(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
  };
  export class BrowserWindow {
    constructor(options: Record<string, unknown>);
    static getAllWindows(): BrowserWindow[];
    webContents: {
      setWindowOpenHandler(
        handler: (details: { url: string }) => { action: 'deny' | 'allow' },
      ): void;
      on(event: string, listener: (...args: unknown[]) => void): void;
      send(channel: string, payload: unknown): void;
    };
    loadFile(path: string): Promise<void>;
  }
  export const session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived(
          handler: (
            details: { responseHeaders?: Record<string, string[]> },
            callback: (response: { responseHeaders: Record<string, string[]> }) => void,
          ) => void,
        ): void;
      };
    };
  };
  export const shell: { openExternal(url: string): Promise<void> };
  export const ipcMain: {
    handle(channel: string, listener: (event: unknown, payload: unknown) => unknown): void;
  };
  export const ipcRenderer: {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
    on(channel: string, listener: (event: unknown, payload: unknown) => void): void;
    removeListener(channel: string, listener: (event: unknown, payload: unknown) => void): void;
  };
  export const contextBridge: { exposeInMainWorld(apiKey: string, api: unknown): void };
}
