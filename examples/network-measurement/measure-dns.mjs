import { NodeDNSProvider } from '../../packages/network-intelligence/dist/index.js';

const hostname = process.argv[2] ?? 'example.com';
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

try {
  const provider = new NodeDNSProvider();
  const result = await provider.lookup(hostname, controller.signal);
  console.log(JSON.stringify({ hostname, ...result }, null, 2));
} finally {
  clearTimeout(timeout);
}
