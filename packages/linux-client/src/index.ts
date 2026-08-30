import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type NetworkSnapshot = {
  interfaces: string;
  routes: string;
  dns: string;
  capturedAt: string;
};

export type ClientPolicy = {
  autonomousMode: boolean;
  preferredInterface?: string;
};

export interface LinuxSystemAdapter {
  snapshot(): Promise<NetworkSnapshot>;
  setAutonomousMode(enabled: boolean): Promise<void>;
}

async function command(file: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync(file, args, { timeout: 5_000, maxBuffer: 512 * 1024 });
    return result.stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `unavailable: ${message}`;
  }
}

export class LinuxSystem implements LinuxSystemAdapter {
  private policy: ClientPolicy = { autonomousMode: false };

  async snapshot(): Promise<NetworkSnapshot> {
    const [interfaces, routes, dns] = await Promise.all([
      command('ip', ['-brief', 'address']),
      command('ip', ['-brief', 'route']),
      command('resolvectl', ['status']),
    ]);
    return { interfaces, routes, dns, capturedAt: new Date().toISOString() };
  }

  async setAutonomousMode(enabled: boolean): Promise<void> {
    this.policy = { ...this.policy, autonomousMode: enabled };
  }

  getPolicy(): ClientPolicy {
    return { ...this.policy };
  }
}

const html = (snapshot: NetworkSnapshot, policy: ClientPolicy): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IRP Linux Client</title><style>body{font:15px system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 16px}pre{white-space:pre-wrap;background:#f4f4f4;padding:16px;border-radius:8px}button{padding:8px 12px}</style></head>
<body><h1>Internet Resilience Platform</h1><p>Linux Full Client</p><p>Autonomous mode: <strong>${policy.autonomousMode ? 'enabled' : 'disabled'}</strong></p>
<form method="post" action="/policy"><button name="autonomousMode" value="${policy.autonomousMode ? 'false' : 'true'}">${policy.autonomousMode ? 'Disable' : 'Enable'} autonomous mode</button></form>
<h2>Network diagnostics</h2><pre>${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre></body></html>`;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export class LinuxClientServer {
  private readonly server = createServer((request, response) => void this.handle(request, response));

  constructor(private readonly system: LinuxSystem) {}

  async start(port = 17861, host = '127.0.0.1'): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => resolve());
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

export async function runLinuxClient(): Promise<LinuxClientServer> {
  const server = new LinuxClientServer(new LinuxSystem());
  await server.start();
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runLinuxClient();
}
