const url = process.argv[2] ?? 'http://127.0.0.1:8080/api/v1/ready';
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 4000);
try {
  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok) process.exit(1);
  const body = await response.json().catch(() => undefined);
  if (body?.success === false) process.exit(1);
  process.exit(0);
} catch {
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
