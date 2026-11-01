export type EmailKind = 'email_verification' | 'password_reset';
export interface EmailMessage {
  to: string;
  kind: EmailKind;
  subject: string;
  text: string;
  /** One-time secret, also embedded in `text`. Carried separately so a relay can template its own link. */
  token: string;
}
export interface EmailSender {
  /** `webhook` really hands the message to an external relay; `development-capture` delivers nothing. */
  readonly mode: 'webhook' | 'development-capture';
  /** Must throw if the message was not accepted for delivery. There is no silent-success path. */
  send(message: EmailMessage): Promise<void>;
}

/** Development/test only: records messages in memory and delivers nothing. Never allowed in production. */
export class CapturingEmailSender implements EmailSender {
  readonly mode = 'development-capture' as const;
  readonly outbox: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
  }
  last(kind: EmailKind, to: string): EmailMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.kind === kind && m.to === to);
  }
}

/** POSTs the message as JSON to a transactional-email relay you operate; any non-2xx response is a failure. */
export class WebhookEmailSender implements EmailSender {
  readonly mode = 'webhook' as const;
  constructor(
    private readonly url: string,
    private readonly bearer?: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8_000,
  ) {}
  async send(message: EmailMessage): Promise<void> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.bearer ? { authorization: `Bearer ${this.bearer}` } : {}),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Email relay rejected the message (HTTP ${res.status}).`);
  }
}

const isProduction = (env: NodeJS.ProcessEnv) =>
  ['production', 'staging'].includes((env.NODE_ENV ?? '').toLowerCase());

/** Fails closed: production/staging without a real relay refuses to start rather than pretending to send mail. */
export const resolveEmailSender = (env: NodeJS.ProcessEnv = process.env): EmailSender => {
  const url = env.IRP_EMAIL_WEBHOOK_URL;
  if (url) {
    if (isProduction(env) && !url.startsWith('https://'))
      throw new Error('IRP_EMAIL_WEBHOOK_URL must use https:// in production or staging.');
    return new WebhookEmailSender(url, env.IRP_EMAIL_WEBHOOK_TOKEN);
  }
  if (isProduction(env))
    throw new Error(
      'IRP_EMAIL_WEBHOOK_URL is required for production or staging: refusing to run without real email delivery.',
    );
  return new CapturingEmailSender();
};
