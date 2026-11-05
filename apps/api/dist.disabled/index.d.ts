import type { IncomingMessage, ServerResponse } from 'node:http';
import { type FastifyInstance } from 'fastify';
import { JwtAuthenticationProvider, RbacAuthorization } from '@irp/auth';
import { type EmailSender } from './identity/mailer.js';
import { type IdentityRepositories } from './identity/types.js';
import { generateSpeedInsightsScript, injectSpeedInsightsIntoHtml, initializeSpeedInsights, defaultSpeedInsightsConfig, type SpeedInsightsConfig } from './speed-insights.js';
declare module 'fastify' {
    interface FastifyRequest {
        jwtAuth: JwtAuthenticationProvider;
        rbac: RbacAuthorization;
        observabilityContext: {
            requestId: string;
            traceId?: string;
            spanId?: string;
        };
    }
}
export interface BuildServerOptions {
    /** Inject repositories (tests). Production resolves PostgreSQL and fails closed without it. */
    identity?: IdentityRepositories;
    /** Inject an email sender (tests). Production requires IRP_EMAIL_WEBHOOK_URL. */
    mailer?: EmailSender;
}
export declare const buildServer: (options?: BuildServerOptions) => Promise<FastifyInstance>;
export { generateSpeedInsightsScript, injectSpeedInsightsIntoHtml, initializeSpeedInsights, defaultSpeedInsightsConfig, type SpeedInsightsConfig, };
/**
 * Vercel's Node.js function loader resolves apps/api/package.json's main field
 * to dist/index.js. Export a default Node handler from this source so the
 * compiled entrypoint is valid and Fastify remains lazily initialized.
 */
export default function handler(request: IncomingMessage, response: ServerResponse): Promise<void>;
//# sourceMappingURL=index.d.ts.map