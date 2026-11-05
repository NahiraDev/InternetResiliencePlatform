/** Development/test only: records messages in memory and delivers nothing. Never allowed in production. */
export class CapturingEmailSender {
    mode = 'development-capture';
    outbox = [];
    async send(message) {
        this.outbox.push(message);
    }
    last(kind, to) {
        return [...this.outbox].reverse().find((m) => m.kind === kind && m.to === to);
    }
}
/** POSTs the message as JSON to a transactional-email relay you operate; any non-2xx response is a failure. */
export class WebhookEmailSender {
    url;
    bearer;
    fetchImpl;
    timeoutMs;
    mode = 'webhook';
    constructor(url, bearer, fetchImpl = fetch, timeoutMs = 8_000) {
        this.url = url;
        this.bearer = bearer;
        this.fetchImpl = fetchImpl;
        this.timeoutMs = timeoutMs;
    }
    async send(message) {
        const res = await this.fetchImpl(this.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(this.bearer ? { authorization: `Bearer ${this.bearer}` } : {}),
            },
            body: JSON.stringify(message),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok)
            throw new Error(`Email relay rejected the message (HTTP ${res.status}).`);
    }
}
const isProduction = (env) => ['production', 'staging'].includes((env.NODE_ENV ?? '').toLowerCase());
/** Fails closed: production/staging without a real relay refuses to start rather than pretending to send mail. */
export const resolveEmailSender = (env = process.env) => {
    const url = env.IRP_EMAIL_WEBHOOK_URL;
    if (url) {
        if (isProduction(env) && !url.startsWith('https://'))
            throw new Error('IRP_EMAIL_WEBHOOK_URL must use https:// in production or staging.');
        return new WebhookEmailSender(url, env.IRP_EMAIL_WEBHOOK_TOKEN);
    }
    if (isProduction(env))
        throw new Error('IRP_EMAIL_WEBHOOK_URL is required for production or staging: refusing to run without real email delivery.');
    return new CapturingEmailSender();
};
//# sourceMappingURL=mailer.js.map