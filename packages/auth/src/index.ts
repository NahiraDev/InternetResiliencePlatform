export interface Principal { id: string; roles: string[]; scopes: string[]; metadata?: Record<string, unknown>; }
export interface AuthenticationRequest { headers: Record<string, string | string[] | undefined>; }
export interface AuthenticationProvider { authenticate(request: AuthenticationRequest): Promise<Principal | null>; }
export interface AuthorizationContext { principal: Principal | null; resource: string; action: string; }
export interface AuthorizationMiddleware { authorize(context: AuthorizationContext): Promise<boolean>; }
export class AnonymousAuthenticationProvider implements AuthenticationProvider { async authenticate(request: AuthenticationRequest): Promise<Principal | null> { void request; return null; } }
export class AllowAnonymousAuthorization implements AuthorizationMiddleware { async authorize(context: AuthorizationContext): Promise<boolean> { void context; return true; } }
