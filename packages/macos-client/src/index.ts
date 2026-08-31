import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type MacOSNetworkSnapshot = {
  interfaces: string;
  routes: string;
  dns: string;
  capturedAt: string;
  platform: 'darwin' | 'unsupported';
};

export type MacOSClientPolicy = {
  autonomousMode: boolean;
  preferredInterface?: string;
};

export interface MacOSSystemAdapter {
  snapshot(): Promise<MacOSNetworkSnapshot>;
  setAutonomousMode(enabled: boolean): Promise<void>;
}

async function command(file: string, args: string[], timeout = 5_000): Promise<string> {
  try {
    const result = await execFileAsync(file, args, { timeout, maxBuffer: 512 * 1024 });
    return result.stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `unavailable: ${message}`;
  }
}

export class MacOSSystem implements MacOSSystemAdapter {
  private policy: MacOSClientPolicy = { autonomousMode: false };

  async snapshot(): Promise<MacOSNetworkSnapshot> {
    if (process.platform !== 'darwin') {
      return {
        interfaces: 'unavailable: macOS platform required',
        routes: 'unavailable: macOS platform required',
        dns: 'unavailable: macOS platform required',
        capturedAt: new Date().toISOString(),
        platform: 'unsupported',
      };
    }

    const [interfaces, routes, dns] = await Promise.all([
      command('ifconfig', []),
      command('route', ['-n', 'get', 'default']),
      command('scutil', ['--dns']),
    ]);
    return { interfaces, routes, dns, capturedAt: new Date().toISOString(), platform: 'darwin' };
  }

  async setAutonomousMode(enabled: boolean): Promise<void> {
    this.policy = { ...this.policy, autonomousMode: enabled };
  }

  getPolicy(): MacOSClientPolicy {
    return { ...this.policy };
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const html = (snapshot: MacOSNetworkSnapshot, policy: MacOSClientPolicy): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IRP macOS Client</title><style>body{font:15px system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 16px}pre{white-space:pre-wrap;background:#f4f4f4;padding:16px;border-radius:8px}button{padding:8px 12px}</style></head>
<body><h1>Internet Resilience Platform</h1><p>macOS Full Client</p><p>Autonomous mode: <strong>${policy.autonomousMode ? 'enabled' : 'disabled'}</strong></p>
<form method="post" action="/policy"><button name="autonomousMode" value="${policy.autonomousMode ? 'false' : 'true'}">${policy.autonomousMode ? 'Disable' : 'Enable'} autonomous mode</button></form>
<h2>Network diagnostics</h2><pre>${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre></body></html>`;

export class MacOSClientServer {
  private readonly server = createServer((request, response) => void this.handle(request, response));

  constructor(private readonly system: MacOSSystem) {}

  async start(port = 17862, host = '127.0.0.1'): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { this.server.off('listening', onListening); reject(error); };
      const onListening = () => { this.server.off('error', onError); resolve(); };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(port, host);
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && request.url === '/') {
      response.end(html(await this.system.snapshot(), this.system.getPolicy()));
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ status: 'ok', platform: process.platform }));
      return;
    }
    if (request.method === 'GET' && request.url === '/policy') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(this.system.getPolicy()));
      return;
    }
    if (request.method === 'POST' && request.url === '/policy') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString('utf8');
      const enabled = /autonomousMode=true(?:&|$)/.test(body);
      await this.system.setAutonomousMode(enabled);
      response.statusCode = 303;
      response.setHeader('Location', '/');
      response.end();
      return;
    }
    response.statusCode = 404;
    response.end('Not Found');
  }
}

export async function runMacOSClient(): Promise<MacOSClientServer> {
  const server = new MacOSClientServer(new MacOSSystem());
  await server.start();
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runMacOSClient();
}
