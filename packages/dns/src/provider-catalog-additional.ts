import type { ProviderMetadata } from './index.js';

export type AdditionalProviderCatalogEntry = ProviderMetadata & {
  dnssec: boolean;
  region: 'IR';
  discovery: 'verified-public-catalog' | 'community-catalog';
};

const provider = (entry: AdditionalProviderCatalogEntry): AdditionalProviderCatalogEntry => entry;

/** Iranian resolver families not already represented in the primary catalog. */
export const ADDITIONAL_IRANIAN_PROVIDER_METADATA: AdditionalProviderCatalogEntry[] = [
  provider({ id: '3dns', name: '3DNS', country: 'IR', homepage: 'https://3dns.ir/', endpoints: { ipv4: ['77.77.77.77', '77.77.77.78'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'derak-cloud', name: 'Derak Cloud', country: 'IR', homepage: 'https://derak.cloud/', endpoints: { ipv4: ['193.151.128.100', '193.151.128.200'], ipv6: [] }, tags: ['iran', 'regional', 'cloud'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'irnic', name: 'IRNIC', country: 'IR', homepage: 'https://irnic.ir/', endpoints: { ipv4: ['193.189.123.2', '193.189.122.83'], ipv6: [] }, tags: ['iran', 'registry', 'institutional'], dnssec: true, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'pishgaman', name: 'Pishgaman', country: 'IR', homepage: 'https://pishgaman.net/', endpoints: { ipv4: ['5.202.100.100', '5.202.100.101'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'rightel', name: 'Rightel', country: 'IR', homepage: 'https://rightel.ir/', endpoints: { ipv4: ['91.239.100.100', '89.223.43.71'], ipv6: [] }, tags: ['iran', 'isp', 'mobile'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'irancell', name: 'Irancell', country: 'IR', homepage: 'https://irancell.ir/', endpoints: { ipv4: ['74.82.42.42'], ipv6: [] }, tags: ['iran', 'isp', 'mobile'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'mci', name: 'MCI / Hamrah Aval', country: 'IR', homepage: 'https://mci.ir/', endpoints: { ipv4: ['208.67.220.200', '208.67.222.222'], ipv6: [] }, tags: ['iran', 'isp', 'mobile'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'arvancloud', name: 'ArvanCloud DNS', country: 'IR', homepage: 'https://www.arvancloud.ir/', endpoints: { ipv4: ['185.51.200.2', '178.22.122.100'], ipv6: [] }, tags: ['iran', 'cloud', 'regional'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'tic', name: 'Telecommunication Infrastructure Company DNS', country: 'IR', homepage: 'https://tic.ir/', endpoints: { ipv4: ['2.189.44.44'], ipv6: [] }, tags: ['iran', 'isp', 'infrastructure'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'ipm', name: 'IPM DNS', country: 'IR', homepage: 'https://ipm.ac.ir/', endpoints: { ipv4: ['194.225.152.10', '194.225.152.12'], ipv6: [] }, tags: ['iran', 'research', 'institutional'], dnssec: true, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'farabordadeh', name: 'Farabord Dadeh Iranian', country: 'IR', homepage: 'https://fardadeh.ir/', endpoints: { ipv4: ['81.91.144.116', '81.91.144.162'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'hesabgar', name: 'Hesabgar Pardaz Gharb', country: 'IR', homepage: 'https://hesabgar.com/', endpoints: { ipv4: ['185.47.48.26'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
];
