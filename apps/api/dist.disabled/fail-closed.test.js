import { describe, expect, it } from 'vitest';
import { resolveEmailSender } from './identity/mailer.js';
import { resolveIdentityRepositories } from './identity/resolve.js';
describe('production fails closed', () => {
    for (const env of ['production', 'staging']) {
        it(`${env}: refuses the in-memory identity store without DATABASE_URL`, () => {
            expect(() => resolveIdentityRepositories({ NODE_ENV: env })).toThrow(/DATABASE_URL is required/);
        });
        it(`${env}: refuses to run without a real email relay`, () => {
            expect(() => resolveEmailSender({ NODE_ENV: env })).toThrow(/IRP_EMAIL_WEBHOOK_URL is required/);
            expect(() => resolveEmailSender({ NODE_ENV: env, IRP_EMAIL_WEBHOOK_URL: 'http://relay.local' })).toThrow(/https/);
        });
    }
    it('non-production uses explicitly labelled development stores and warns', () => {
        const warnings = [];
        const repos = resolveIdentityRepositories({ NODE_ENV: 'development' }, (m) => warnings.push(m));
        expect(repos.kind).toBe('development-memory');
        expect(warnings.join('')).toMatch(/NON-DURABLE/);
        expect(resolveEmailSender({ NODE_ENV: 'development' }).mode).toBe('development-capture');
    });
});
//# sourceMappingURL=fail-closed.test.js.map