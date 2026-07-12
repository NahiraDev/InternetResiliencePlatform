import type { AppConfig } from '@irp/config';
import type { Logger } from '@irp/logger';
export interface Lifecycle { start(): Promise<void>; stop(): Promise<void>; }
export interface Plugin extends Lifecycle { id: string; }
export type Token<T> = string & { readonly __type?: T };
export class Container { private readonly services = new Map<string, unknown>(); register<T>(token: Token<T> | string, service: T): void { this.services.set(token, service); } resolve<T>(token: Token<T> | string): T { const service = this.services.get(token); if (service === undefined) throw new Error(`Service not registered: ${token}`); return service as T; } }
export class AppError extends Error { constructor(public readonly code: string, message: string, public readonly statusCode = 500, public readonly details?: Record<string, unknown>) { super(message); } }
export class ValidationAppError extends AppError { constructor(message: string, details?: Record<string, unknown>) { super('VALIDATION_ERROR', message, 400, details); } }
export class NotFoundAppError extends AppError { constructor(resource: string) { super('NOT_FOUND', `${resource} was not found`, 404); } }
export const mapErrorToHttp = (error: unknown): { statusCode: number; body: { code: string; message: string; details?: Record<string, unknown> } } => error instanceof AppError ? { statusCode: error.statusCode, body: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } : { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } };
export class Application implements Lifecycle { private readonly plugins: Plugin[] = []; constructor(public readonly config: AppConfig, public readonly logger: Logger, public readonly container = new Container()) {} use(plugin: Plugin): void { this.plugins.push(plugin); } async start(): Promise<void> { this.logger.info('application starting', { plugins: this.plugins.map((p) => p.id) }); for (const plugin of this.plugins) await plugin.start(); } async stop(): Promise<void> { for (const plugin of [...this.plugins].reverse()) await plugin.stop(); this.logger.info('application stopped'); } }
