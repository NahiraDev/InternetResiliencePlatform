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
export declare class AnonymousAuthenticationProvider implements AuthenticationProvider {
    authenticate(request: AuthenticationRequest): Promise<Principal | null>;
}
export declare class AllowAnonymousAuthorization implements AuthorizationMiddleware {
    authorize(context: AuthorizationContext): Promise<boolean>;
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
export declare class JwtService {
    private readonly secret;
    private readonly issuer;
    constructor(secret: string, issuer?: string);
    sign(input: Omit<JwtClaims, 'iat' | 'exp' | 'jti'> & {
        ttlSeconds: number;
    }): string;
    verify(token: string, type?: JwtClaims['type']): JwtClaims;
}
export declare class JwtAuthenticationProvider implements AuthenticationProvider {
    private readonly jwt;
    constructor(jwt: JwtService);
    authenticate(request: AuthenticationRequest): Promise<Principal | null>;
}
export declare class RbacAuthorization implements AuthorizationMiddleware {
    authorize(context: AuthorizationContext): Promise<boolean>;
}
export declare const hashPassword: (password: string) => string;
export declare const verifyPassword: (password: string, hash: string) => boolean;
export * from './client-security.js';
//# sourceMappingURL=index.d.ts.map