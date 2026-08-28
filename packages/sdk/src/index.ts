export type {
  BuiltinCapability,
  Capability,
  ContractNamespace,
  KernelContract,
  KernelContext,
  KernelMessage,
  Principal,
  WorkflowDefinition,
  WorkflowResult,
} from '@irp/kernel';
export {
  CapabilityError,
  KernelError,
  KernelRuntime,
  createContract,
  createKernel,
} from '@irp/kernel';

export const PRODUCT_API_VERSION = '1' as const;
export const PRODUCT_API_PATH = '/api/v1' as const;

export type ProductApiClient = 'web' | 'desktop' | 'ios' | 'android';
export type ProductCapabilityStatus = 'implemented' | 'pending-verification' | 'planned';
export type ProductCapabilityKind = 'read' | 'mutate' | 'stream';
export type ProductCapabilityAuthentication = 'none' | 'bearer' | 'device-credential';

export interface ProductCapability {
  id: string;
  status: ProductCapabilityStatus;
  kind: ProductCapabilityKind;
  methods: readonly string[];
  paths: readonly string[];
  authentication: ProductCapabilityAuthentication;
  requiredPermissions: readonly string[];
  description: string;
}

export interface ProductApiManifest {
  api: {
    name: string;
    version: typeof PRODUCT_API_VERSION;
    pathPrefix: typeof PRODUCT_API_PATH;
    compatibility: 'backward-compatible-within-major';
  };
  clients: readonly ProductApiClient[];
  capabilities: readonly ProductCapability[];
}

export interface ProductApiContext {
  apiVersion: typeof PRODUCT_API_VERSION;
  principal: {
    id: string;
    roles: readonly string[];
    scopes: readonly string[];
    organizationId?: string;
  };
  capabilities: readonly string[];
}

export interface SdkOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  accessToken?: string;
  apiVersion?: typeof PRODUCT_API_VERSION;
}

export class ProductApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ProductApiError';
  }
}

interface ApiErrorBody {
  error?: {
    message?: string;
    code?: string;
  };
}

export class InternetResilienceClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly accessToken: string | undefined;
  private readonly apiVersion: typeof PRODUCT_API_VERSION;

  constructor(private readonly options: SdkOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
    this.apiVersion = options.apiVersion ?? PRODUCT_API_VERSION;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('x-api-version', `v${this.apiVersion}`);
    if (this.accessToken) headers.set('authorization', `Bearer ${this.accessToken}`);

    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
    const body = (await response.json()) as T | ApiErrorBody;
    if (!response.ok) {
      const error = body as ApiErrorBody;
      throw new ProductApiError(
        error.error?.message ?? `Request failed: ${response.status}`,
        response.status,
        error.error?.code,
      );
    }
    return body as T;
  }

  async health(): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${PRODUCT_API_PATH}/health`);
    if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
    return response.json();
  }

  async version(): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${PRODUCT_API_PATH}/version`);
    if (!response.ok) throw new Error(`Version request failed: ${response.status}`);
    return response.json();
  }

  async capabilities(): Promise<ProductApiManifest> {
    const envelope = await this.request<{ success: true; data: ProductApiManifest }>(
      `${PRODUCT_API_PATH}/product/capabilities`,
    );
    return envelope.data;
  }

  async context(): Promise<ProductApiContext> {
    const envelope = await this.request<{ success: true; data: ProductApiContext }>(
      `${PRODUCT_API_PATH}/product/context`,
    );
    return envelope.data;
  }

  async requestCapability<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith(`${PRODUCT_API_PATH}/`)) {
      throw new TypeError(`Product API paths must use ${PRODUCT_API_PATH}/.`);
    }
    return this.request<T>(path, init);
  }
}
