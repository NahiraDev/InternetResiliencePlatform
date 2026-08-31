import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type WindowsNetworkSnapshot = {
  interfaces: string;
  routes: string;
  dns: string;
  capturedAt: string;
  platform: 'win32' | 'unsupported';
};

export type WindowsClientPolicy = {
  autonomousMode: boolean;
};

export interface WindowsSystemAdapter {
  snapshot(): Promise<WindowsNetworkSnapshot>;
  setAutonomousMode(enabled: boolean): Promise<void>;
}

async function command(file: string, args: string[], timeout = 5_000): Promise<string> {
  try {
    const result = await execFileAsync(file, args, { timeout, maxBuffer: 512 * 1024, windowsHide: true });
    return result.stdout.trim();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class WindowsSystem implements WindowsSystemAdapter {
  private policy: WindowsClientPolicy = { autonomousMode: false };

  async snapshot(): Promise<WindowsNetworkSnapshot> {
    if (process.platform !== 'win32') {
      return {
        interfaces: 'unavailable: Windows platform required',
        routes: 'unavailable: Windows platform required',
        dns: 'unavailable: Windows platform required',
        capturedAt: new Date().toISOString(),
        platform: 'unsupported',
      };
    }

    const [interfaces, routes, dns] = await Promise.all([
      command('ipconfig', ['/all']),
      command('route', ['print']),
      command('netsh', ['interface', 'ip', 'show', 'dns']),
    ]);
    return { interfaces, routes, dns, capturedAt: new Date().toISOString(), platform: 'win32' };
  }

  async setAutonomousMode(enabled: boolean): Promise<void> {
    this.policy = { autonomousMode: enabled };
  }

  getPolicy(): WindowsClientPolicy {
    return { ...this.policy };
  }
}
