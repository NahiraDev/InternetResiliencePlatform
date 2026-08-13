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
export interface SdkOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}
export class InternetResilienceClient {
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: SdkOptions) {
    this.fetcher = options.fetch ?? fetch;
  }
  async health(): Promise<unknown> {
    const response = await this.fetcher(`${this.options.baseUrl}/api/v1/health`);
    if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
    return response.json();
  }
  async version(): Promise<unknown> {
    const response = await this.fetcher(`${this.options.baseUrl}/api/v1/version`);
    if (!response.ok) throw new Error(`Version request failed: ${response.status}`);
    return response.json();
  }
}
