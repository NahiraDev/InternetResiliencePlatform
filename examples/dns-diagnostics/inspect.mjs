import { NodeDNSProvider } from '../../packages/network-intelligence/dist/index.js';

const hostname = process.argv[2] ?? 'example.com';
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

try {
  const result = await new NodeDNSProvider().lookup(hostname, controller.signal);
  console.log(`DNS lookup: ${hostname}`);
  console.log(`Duration: ${result.lookupMs.toFixed(2)} ms`);
  console.log(`Addresses: ${result.addresses.join(', ') || '(none)'}`);
} finally {
  clearTimeout(timeout);
}
