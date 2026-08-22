const baseUrl = process.env.IRP_API_BASE_URL ?? 'http://127.0.0.1:3000';
const url = new URL('/api/v1/platform/status', baseUrl);

const response = await fetch(url);
const body = await response.text();

if (!response.ok) {
  console.error(`HTTP ${response.status}: ${body}`);
  process.exitCode = 1;
} else {
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
}
