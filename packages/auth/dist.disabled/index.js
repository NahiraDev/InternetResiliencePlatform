import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
export class AnonymousAuthenticationProvider {
    async authenticate(request) {
        void request;
        return null;
    }
}
export class AllowAnonymousAuthorization {
    async authorize(context) {
        void context;
        return true;
    }
}
const b64url = (input) => Buffer.from(input).toString('base64url');
const parseJson = (value) => {
    try {
        return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    }
    catch {
        throw new Error('Invalid token payload.');
    }
};
export class JwtService {
    secret;
    issuer;
    constructor(secret, issuer = 'internet-resilience-platform') {
        this.secret = secret;
        this.issuer = issuer;
        if (secret.length < 32)
            throw new Error('JWT secret must be at least 32 characters.');
    }
    sign(input) {
        const now = Math.floor(Date.now() / 1000);
        const header = { alg: 'HS256', typ: 'JWT' };
        const payload = {
            iss: this.issuer,
            ...input,
            iat: now,
            exp: now + input.ttlSeconds,
            jti: randomUUID(),
        };
        const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
        return `${body}.${createHmac('sha256', this.secret).update(body).digest('base64url')}`;
    }
    verify(token, type) {
        const parts = token.split('.');
        if (parts.length !== 3)
            throw new Error('Invalid token format.');
        const [header, payload, signature] = parts;
        if (!header || !payload || !signature)
            throw new Error('Invalid token format.');
        const decodedHeader = parseJson(header);
        if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT')
            throw new Error('Invalid token algorithm.');
        const expected = createHmac('sha256', this.secret)
            .update(`${header}.${payload}`)
            .digest('base64url');
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (signatureBuffer.length !== expectedBuffer.length ||
            !timingSafeEqual(signatureBuffer, expectedBuffer))
            throw new Error('Invalid token signature.');
        const claims = parseJson(payload);
        if (typeof claims.sub !== 'string' ||
            !Array.isArray(claims.roles) ||
            !Array.isArray(claims.scopes))
            throw new Error('Invalid token claims.');
        if (claims.iss !== this.issuer)
            throw new Error('Invalid token issuer.');
        if (claims.exp <= Math.floor(Date.now() / 1000))
            throw new Error('Token expired.');
        if (type && claims.type !== type)
            throw new Error('Invalid token type.');
        return claims;
    }
}
export class JwtAuthenticationProvider {
    jwt;
    constructor(jwt) {
        this.jwt = jwt;
    }
    async authenticate(request) {
        const raw = request.headers.authorization;
        const value = Array.isArray(raw) ? raw[0] : raw;
        if (!value?.startsWith('Bearer '))
            return null;
        const claims = this.jwt.verify(value.slice(7), 'access');
        return {
            id: claims.sub,
            roles: claims.roles,
            scopes: claims.scopes,
            ...(claims.organizationId ? { organizationId: claims.organizationId } : {}),
            metadata: { sessionId: claims.sessionId, jti: claims.jti },
        };
    }
}
export class RbacAuthorization {
    async authorize(context) {
        if (!context.requiredPermissions?.length)
            return true;
        if (!context.principal)
            return false;
        if (context.principal.roles.includes('platform_admin'))
            return true;
        return context.requiredPermissions.every((permission) => context.principal?.scopes.includes(permission));
    }
}
export const hashPassword = (password) => {
    const salt = randomBytes(16).toString('hex');
    return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
};
export const verifyPassword = (password, hash) => {
    const [, salt, digest] = hash.split('$');
    if (!salt || !digest)
        return false;
    const candidate = scryptSync(password, salt, 64);
    let expected;
    try {
        expected = Buffer.from(digest, 'hex');
    }
    catch {
        return false;
    }
    if (candidate.length !== expected.length)
        return false;
    try {
        return timingSafeEqual(candidate, expected);
    }
    catch {
        return false;
    }
};
export * from './client-security.js';
//# sourceMappingURL=index.js.map