import { z } from 'zod';
export const IdentifierSchema = z.string().min(1).max(128);
export const createId = (prefix = 'irp') => `${prefix}_${crypto.randomUUID()}`;
//# sourceMappingURL=index.js.map