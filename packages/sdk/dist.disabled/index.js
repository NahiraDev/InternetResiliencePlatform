export { CapabilityError, KernelError, KernelRuntime, createContract, createKernel, } from '@irp/kernel';
export const PRODUCT_API_VERSION = '1';
export const PRODUCT_API_PATH = '/api/v1';
export class ProductApiError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'ProductApiError';
    }
}
export class InternetResilienceClient {
    options;
    fetcher;
    baseUrl;
    accessToken;
    apiVersion;
    constructor(options) {
        this.options = options;
        this.fetcher = options.fetch ?? fetch;
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.accessToken = options.accessToken;
        this.apiVersion = options.apiVersion ?? PRODUCT_API_VERSION;
    }
    async request(path, init = {}) {
        const headers = new Headers(init.headers);
        headers.set('accept', 'application/json');
        headers.set('x-api-version', `v${this.apiVersion}`);
        if (this.accessToken)
            headers.set('authorization', `Bearer ${this.accessToken}`);
        const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
        const body = (await response.json());
        if (!response.ok) {
            const error = body;
            throw new ProductApiError(error.error?.message ?? `Request failed: ${response.status}`, response.status, error.error?.code);
        }
        return body;
    }
    async health() {
        const response = await this.fetcher(`${this.baseUrl}${PRODUCT_API_PATH}/health`);
        if (!response.ok)
            throw new Error(`Health request failed: ${response.status}`);
        return response.json();
    }
    async version() {
        const response = await this.fetcher(`${this.baseUrl}${PRODUCT_API_PATH}/version`);
        if (!response.ok)
            throw new Error(`Version request failed: ${response.status}`);
        return response.json();
    }
    async capabilities() {
        const envelope = await this.request(`${PRODUCT_API_PATH}/product/capabilities`);
        return envelope.data;
    }
    async context() {
        const envelope = await this.request(`${PRODUCT_API_PATH}/product/context`);
        return envelope.data;
    }
    async requestCapability(path, init = {}) {
        if (!path.startsWith(`${PRODUCT_API_PATH}/`)) {
            throw new TypeError(`Product API paths must use ${PRODUCT_API_PATH}/.`);
        }
        return this.request(path, init);
    }
    // ── Device control plane ────────────────────────────────────────────────
    async deviceSnapshot(deviceId) {
        return this.request(`${PRODUCT_API_PATH}/remote/devices/${encodeURIComponent(deviceId)}/snapshot`)
            .then((r) => r.data);
    }
    async deviceAnalytics(deviceId) {
        return this.request(`${PRODUCT_API_PATH}/remote/devices/${encodeURIComponent(deviceId)}/analytics`)
            .then((r) => r.data);
    }
    async devicePolicy(deviceId) {
        return this.request(`${PRODUCT_API_PATH}/remote/devices/${encodeURIComponent(deviceId)}/policy`)
            .then((r) => r.data);
    }
    async setDevicePolicy(deviceId, autonomousMode) {
        return this.request(`${PRODUCT_API_PATH}/remote/devices/${encodeURIComponent(deviceId)}/policy`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ autonomousMode }),
        }).then((r) => r.data);
    }
    // ── Remote client authentication ────────────────────────────────────────
    async remoteClientToken(credentialId, secret) {
        return this.request(`${PRODUCT_API_PATH}/auth/remote/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ credentialId, secret }),
        }).then((r) => r.data);
    }
    async remoteClientRefresh(refreshToken) {
        return this.request(`${PRODUCT_API_PATH}/auth/remote/refresh`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        }).then((r) => r.data);
    }
}
//# sourceMappingURL=index.js.map