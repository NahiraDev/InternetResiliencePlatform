import { z } from 'zod';

export const IdentifierSchema = z.string().min(1).max(128);
export type Identifier = z.infer<typeof IdentifierSchema>;
export type EntityId = string;
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  id: string;
  type: TType;
  aggregateId: string;
  occurredAt: Date;
  payload: TPayload;
  metadata?: Record<string, string>;
}
export interface Repository<TEntity, TId = string> {
  findById(id: TId): Promise<TEntity | null>;
  save(entity: TEntity): Promise<TEntity>;
  delete(id: TId): Promise<void>;
}
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
export const createId = (prefix = 'irp'): string => `${prefix}_${crypto.randomUUID()}`;

export type {
  ProductApiClient,
  ProductApiContext,
  ProductApiManifest,
  ProductApiPrincipal,
  ProductCapability,
  ProductCapabilityKind,
  ProductCapabilityStatus,
} from './product-api.js';
export { PRODUCT_API_MANIFEST, PRODUCT_API_PATH, PRODUCT_API_VERSION } from './product-api.js';
