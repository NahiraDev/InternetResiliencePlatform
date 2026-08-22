const baseUrl = process.env.IRP_API_BASE_URL ?? 'http://127.0.0.1:3000';
const response = await fetch(new URL('/api/v1/platform/status', baseUrl));
const text = await response.text();

if (!response.ok) {
  throw new Error(`IRP API returned HTTP ${response.status}: ${text}`);
}

const payload = JSON.parse(text);
const status = payload?.data?.status ?? payload?.status ?? 'unknown';
console.log(JSON.stringify({ observed: true, status }, null, 2));
