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
export type {
  ProductApiClient,
  ProductApiContext,
  ProductApiManifest,
  ProductApiPrincipal,
  ProductCapability,
  ProductCapabilityKind,
  ProductCapabilityStatus,
} from '@irp/shared';
export { PRODUCT_API_MANIFEST, PRODUCT_API_PATH, PRODUCT_API_VERSION } from '@irp/shared';

export interface SdkOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  accessToken?: string;
  apiVersion?: typeof import('@irp/shared').PRODUCT_API_VERSION;
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

export class InternetResilienceClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly accessToken?: string;
  private readonly apiVersion: string;

  constructor(private readonly options: SdkOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
    this.apiVersion = options.apiVersion ?? '1';
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('x-api-version', `v${this.apiVersion}`);
    if (this.accessToken) headers.set('authorization', `Bearer ${this.accessToken}`);

    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
    const body = (await response.json()) as T | { error?: { message?: string; code?: string } };
    if (!response.ok) {
      const error = body as { error?: { message?: string; code?: string } };
      throw new ProductApiError(
        error.error?.message ?? `Request failed: ${response.status}`,
        response.status,
        error.error?.code,
      );
    }
    return body as T;
  }

  async health(): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}/api/v1/health`);
    if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
    return response.json();
  }

  async version(): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}/api/v1/version`);
    if (!response.ok) throw new Error(`Version request failed: ${response.status}`);
    return response.json();
  }

  async capabilities(): Promise<ProductApiManifest> {
    const envelope = await this.request<{ success: true; data: ProductApiManifest }>(
      '/api/v1/product/capabilities',
    );
    return envelope.data;
  }

  async context(): Promise<ProductApiContext> {
    const envelope = await this.request<{ success: true; data: ProductApiContext }>(
      '/api/v1/product/context',
    );
    return envelope.data;
  }

  async requestCapability<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith('/api/v1/')) throw new TypeError('Product API paths must use /api/v1/.');
    return this.request<T>(path, init);
  }
}
