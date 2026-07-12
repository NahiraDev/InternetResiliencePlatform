import type { AppConfig } from '@irp/config';
import type { Logger } from '@irp/logger';

export interface Lifecycle { start(): Promise<void>; stop(): Promise<void>; }
export interface Plugin extends Lifecycle { id: string; }
export class Container { private readonly services = new Map<string, unknown>(); register<T>(token: string, service: T): void { this.services.set(token, service); } resolve<T>(token: string): T { const service = this.services.get(token); if (service === undefined) throw new Error(`Service not registered: ${token}`); return service as T; } }
export class Application implements Lifecycle { private readonly plugins: Plugin[] = []; constructor(public readonly config: AppConfig, public readonly logger: Logger, public readonly container = new Container()) {} use(plugin: Plugin): void { this.plugins.push(plugin); } async start(): Promise<void> { this.logger.info('application starting', { plugins: this.plugins.map((p) => p.id) }); for (const plugin of this.plugins) await plugin.start(); } async stop(): Promise<void> { for (const plugin of [...this.plugins].reverse()) await plugin.stop(); this.logger.info('application stopped'); } }
