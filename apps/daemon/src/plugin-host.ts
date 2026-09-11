import type { InternetResiliencePlugin } from '@irp/plugin-sdk';
import { PluginManager } from '@irp/plugin-manager';

export class PluginHost {
  private readonly manager: PluginManager;
  private readonly plugins: InternetResiliencePlugin[];
  private running = false;

  constructor(plugins: readonly InternetResiliencePlugin[] = []) {
    this.plugins = [...plugins];
    this.manager = new PluginManager();
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.manager.installAll(this.plugins);
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    for (const entry of this.manager.runtime.registry.list()) {
      if (entry.status === 'active' && entry.manifest.activationEvents.includes('onStartup')) {
        try {
          await this.manager.runtime.suspend(entry.manifest.id);
        } catch {
          // best-effort shutdown
        }
      }
    }
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  status(): { loaded: string[]; active: string[] } {
    if (!this.running) return { loaded: [], active: [] };
    const registrations = this.manager.runtime.registry.list();
    return {
      loaded: registrations.map((entry) => entry.manifest.id),
      active: registrations.filter((entry) => entry.status === 'active').map((entry) => entry.manifest.id),
    };
  }
}