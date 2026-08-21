import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export interface Principal {
  id: string;
  roles: string[];
  scopes: string[];
  organizationId?: string;
  metadata?: Record<string, unknown>;
}
export interface AuthenticationRequest {
  headers: Record<string, string | string[] | undefined>;
}
export interface AuthenticationProvider {
  authenticate(request: AuthenticationRequest): Promise<Principal | null>;
}
export interface AuthorizationContext {
  principal: Principal | null;
  resource: string;
  action: string;
  requiredPermissions?: string[];
}
export interface AuthorizationMiddleware {
  authorize(context: AuthorizationContext): Promise<boolean>;
}
export class AnonymousAuthenticationProvider implements AuthenticationProvider {
  async authenticate(request: AuthenticationRequest): Promise<Principal | null> {
    void request;
    return null;
  }
}
export class AllowAnonymousAuthorization implements AuthorizationMiddleware {
  async authorize(context: AuthorizationContext): Promise<boolean> {
    void context;
    return true;
  }
}

export interface JwtClaims {
  sub: string;
  roles: string[];
  scopes: string[];
  organizationId?: string;
  sessionId?: string;
  type: 'access' | 'refresh' | 'email-verification' | 'password-reset';
  iat: number;
  exp: number;
  jti: string;
}
const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');
const parseJson = <T>(value: string): T => {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    throw new Error('Invalid token payload.');
  }
};
export class JwtService {
  constructor(
    private readonly secret: string,
    private readonly issuer = 'internet-resilience-platform',
  ) {
    if (secret.length < 32) throw new Error('JWT secret must be at least 32 characters.');
  }
  sign(input: Omit<JwtClaims, 'iat' | 'exp' | 'jti'> & { ttlSeconds: number }): string {
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
  verify(token: string, type?: JwtClaims['type']): JwtClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format.');
    const [header, payload, signature] = parts;
    if (!header || !payload || !signature) throw new Error('Invalid token format.');
    const decodedHeader = parseJson<{ alg?: unknown; typ?: unknown }>(header);
    if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT')
      throw new Error('Invalid token algorithm.');
    const expected = createHmac('sha256', this.secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    )
      throw new Error('Invalid token signature.');
    const claims = parseJson<JwtClaims & { iss: string }>(payload);
    if (
      typeof claims.sub !== 'string' ||
      !Array.isArray(claims.roles) ||
      !Array.isArray(claims.scopes)
    )
      throw new Error('Invalid token claims.');
    if (claims.iss !== this.issuer) throw new Error('Invalid token issuer.');
    if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Token expired.');
    if (type && claims.type !== type) throw new Error('Invalid token type.');
    return claims;
  }
}
export class JwtAuthenticationProvider implements AuthenticationProvider {
  constructor(private readonly jwt: JwtService) {}
  async authenticate(request: AuthenticationRequest): Promise<Principal | null> {
    const raw = request.headers.authorization;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value?.startsWith('Bearer ')) return null;
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
export class RbacAuthorization implements AuthorizationMiddleware {
  async authorize(context: AuthorizationContext): Promise<boolean> {
    if (!context.requiredPermissions?.length) return true;
    if (!context.principal) return false;
    if (context.principal.roles.includes('platform_admin')) return true;
    return context.requiredPermissions.every((permission) =>
      context.principal?.scopes.includes(permission),
    );
  }
}
export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
};
export const verifyPassword = (password: string, hash: string): boolean => {
  const [, salt, digest] = hash.split('$');
  if (!salt || !digest) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(digest, 'hex'));
};

export * from './client-security.js';
