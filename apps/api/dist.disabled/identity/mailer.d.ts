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
export declare class CapturingEmailSender implements EmailSender {
    readonly mode: "development-capture";
    readonly outbox: EmailMessage[];
    send(message: EmailMessage): Promise<void>;
    last(kind: EmailKind, to: string): EmailMessage | undefined;
}
/** POSTs the message as JSON to a transactional-email relay you operate; any non-2xx response is a failure. */
export declare class WebhookEmailSender implements EmailSender {
    private readonly url;
    private readonly bearer?;
    private readonly fetchImpl;
    private readonly timeoutMs;
    readonly mode: "webhook";
    constructor(url: string, bearer?: string | undefined, fetchImpl?: typeof fetch, timeoutMs?: number);
    send(message: EmailMessage): Promise<void>;
}
/** Fails closed: production/staging without a real relay refuses to start rather than pretending to send mail. */
export declare const resolveEmailSender: (env?: NodeJS.ProcessEnv) => EmailSender;
//# sourceMappingURL=mailer.d.ts.map