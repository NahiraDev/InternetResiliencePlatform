import type { FastifyInstance } from 'fastify';
import { ProbeFederation } from '@irp/resilience-runtime';
export interface ProbeFederationApiHandle {
    federation: ProbeFederation;
}
export declare const registerProbeFederationRoutes: (app: FastifyInstance, federation?: ProbeFederation) => ProbeFederationApiHandle;
//# sourceMappingURL=probe-federation-api.d.ts.map