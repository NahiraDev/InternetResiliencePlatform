import { app, BrowserWindow, session, shell } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc.js';
import { log } from './logger.js';
import { DesktopInitializationError } from './errors.js';
const isDev = !app.isPackaged;
function isAllowedNavigation(url: string) {
  return url.startsWith('file://') || (isDev && url.startsWith('http://localhost:5173/'));
}
async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 768,
    title: 'Internet Resilience Platform',
    webPreferences: {
      preload: join(app.getAppPath(), 'dist/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://docs.internet-resilience.local/')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (...args: unknown[]) => {
    const [event, url] = args as [{ preventDefault(): void }, string];
    if (!isAllowedNavigation(url)) event.preventDefault();
  });
  await win.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'));
}
app.whenReady().then(async () => {
  try {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          ],
        },
      }),
    );
    registerIpc(app.getVersion());
    await createWindow();
    log('application', 'Desktop app started', { mode: isDev ? 'development' : 'production' });
  } catch (error) {
    log('application', 'Startup failed', {
      error: error instanceof Error ? error.name : 'unknown',
    });
    throw new DesktopInitializationError();
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
