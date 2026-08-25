import type { ProviderMetadata } from './index.js';

export type BuiltinProviderCatalogEntry = ProviderMetadata & {
  dnssec: boolean;
  region: 'IR' | 'global';
  discovery: 'curated' | 'verified-public-catalog' | 'community-catalog';
};

const provider = (entry: BuiltinProviderCatalogEntry): BuiltinProviderCatalogEntry => entry;

/**
 * Extended resolver catalog.
 *
 * Catalog membership is identity/discovery metadata only. It MUST NOT imply
 * preference or reachability. Runtime probing, protocol validation, historical
 * health and regional measurements remain authoritative for selection.
 *
 * Iranian entries are sourced from multiple public resolver catalogs and are
 * intentionally kept separate from the global curated set so the registry can
 * distinguish regional candidates without assigning them an artificial score.
 */
export const EXTENDED_PROVIDER_METADATA: BuiltinProviderCatalogEntry[] = [
  // Iranian public / regional resolvers.
  provider({ id: 'shecan', name: 'Shecan', country: 'IR', homepage: 'https://shecan.ir/', endpoints: { ipv4: ['178.22.122.100', '185.51.200.2'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'shecan-2', name: 'Shecan Secondary', country: 'IR', homepage: 'https://shecan.ir/', endpoints: { ipv4: ['178.22.122.101', '185.51.200.1'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'begzar', name: 'Begzar', country: 'IR', homepage: 'https://begzar.ir/', endpoints: { ipv4: ['185.55.225.25', '185.55.226.26'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'begzar-2', name: 'Begzar Secondary', country: 'IR', homepage: 'https://begzar.ir/', endpoints: { ipv4: ['185.55.224.24'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: '403', name: '403 Online', country: 'IR', homepage: 'https://403.online/', endpoints: { ipv4: ['10.202.10.202', '10.202.10.102'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'radar', name: 'Radar', country: 'IR', homepage: 'https://radar.game/', endpoints: { ipv4: ['10.202.10.10', '10.202.10.11'], ipv6: [] }, tags: ['iran', 'regional', 'gaming'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'electro', name: 'Electro', country: 'IR', homepage: 'https://electro.team/', endpoints: { ipv4: ['78.157.42.100', '78.157.42.101'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'shatel', name: 'Shatel', country: 'IR', homepage: 'https://shatel.ir/', endpoints: { ipv4: ['85.15.1.14', '85.15.1.15'], ipv6: [] }, tags: ['iran', 'isp', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'shelter', name: 'Shelter', country: 'IR', homepage: 'https://shelter.ir/', endpoints: { ipv4: ['78.157.60.6', '78.157.60.242'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'shelter-2', name: 'Shelter Secondary', country: 'IR', homepage: 'https://shelter.ir/', endpoints: { ipv4: ['91.92.250.185', '91.92.244.233'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'beshkan', name: 'Beshkan', country: 'IR', homepage: 'https://beshkan.org/', endpoints: { ipv4: ['181.41.194.177', '181.41.194.186'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'nobarcloud', name: 'NobarCloud', country: 'IR', homepage: 'https://nobarcloud.com/', endpoints: { ipv4: ['78.110.120.220', '78.110.120.200'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'dynx', name: 'DynX', country: 'IR', homepage: 'https://dynx.ir/', endpoints: { ipv4: ['193.24.103.1', '193.24.103.2'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'bertina', name: 'Bertina', country: 'IR', homepage: 'https://bertina.ir/', endpoints: { ipv4: ['193.186.32.32'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'hostiran', name: 'Hostiran', country: 'IR', homepage: 'https://hostiran.net/', endpoints: { ipv4: ['172.29.0.100', '172.29.2.100'], ipv6: [] }, tags: ['iran', 'private-network'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),
  provider({ id: 'vanilla', name: 'Vanilla', country: 'IR', homepage: 'https://vanilla.ir/', endpoints: { ipv4: ['10.139.177.21', '10.139.177.22'], ipv6: [] }, tags: ['iran', 'private-network'], dnssec: false, region: 'IR', discovery: 'community-catalog' }),

  // Public Iranian ISP / institutional resolvers observed by continuously
  // checked public-DNS catalogs. These are candidates, not guaranteed public
  // service contracts; runtime probes decide whether they remain usable.
  provider({ id: 'itc-recursive', name: 'ITC Recursive DNS', country: 'IR', homepage: 'https://ito.gov.ir/', endpoints: { ipv4: ['217.218.155.155', '217.218.155.154'], ipv6: [] }, tags: ['iran', 'isp', 'institutional'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'itc-2-188-21-100', name: 'ITC Public Resolver', country: 'IR', homepage: 'https://ito.gov.ir/', endpoints: { ipv4: ['2.188.21.100'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'itc-2-188-21-120', name: 'ITC Public Resolver 120', country: 'IR', homepage: 'https://ito.gov.ir/', endpoints: { ipv4: ['2.188.21.120'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'itc-2-188-21-130', name: 'ITC Public Resolver 130', country: 'IR', homepage: 'https://ito.gov.ir/', endpoints: { ipv4: ['2.188.21.130'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'itc-2-188-21-133', name: 'ITC Public Resolver 133', country: 'IR', homepage: 'https://ito.gov.ir/', endpoints: { ipv4: ['2.188.21.133'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'itc-2-188-21-190', name: 'ITC Public Resolver 190', country: 'IR', homepage: 'https://ito.gov.ir/', endpoints: { ipv4: ['2.188.21.190'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'itc-2-188-21-200', name: 'ITC Public Resolver 200', country: 'IR', homepage: 'https://ito.gov.ir/', endpoints: { ipv4: ['2.188.21.200'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'tic-2-189-44-44', name: 'TIC Public Resolver', country: 'IR', homepage: 'https://tic.ir/', endpoints: { ipv4: ['2.189.44.44'], ipv6: [] }, tags: ['iran', 'isp', 'infrastructure'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'ipm-194-225-152-10', name: 'IPM Resolver', country: 'IR', homepage: 'https://ipm.ac.ir/', endpoints: { ipv4: ['194.225.152.10'], ipv6: [] }, tags: ['iran', 'research', 'institutional'], dnssec: true, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'ipm-194-225-152-12', name: 'IPM Resolver 12', country: 'IR', homepage: 'https://ipm.ac.ir/', endpoints: { ipv4: ['194.225.152.12'], ipv6: [] }, tags: ['iran', 'research', 'institutional'], dnssec: true, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'tums', name: 'Tehran University of Medical Sciences DNS', country: 'IR', homepage: 'https://tums.ac.ir/', endpoints: { ipv4: ['194.225.62.80'], ipv6: [] }, tags: ['iran', 'university', 'institutional'], dnssec: true, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'irost', name: 'IROST DNS', country: 'IR', homepage: 'https://irost.org/', endpoints: { ipv4: ['213.176.123.5'], ipv6: [] }, tags: ['iran', 'research', 'institutional'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'parsonline', name: 'ParsOnline Resolver', country: 'IR', homepage: 'https://parsonline.com/', endpoints: { ipv4: ['91.99.101.13'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'parvazsys', name: 'Parvaz System DNS', country: 'IR', homepage: 'https://parvazsys.ir/', endpoints: { ipv4: ['185.161.112.33', '185.161.112.34'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'kcpcloud', name: 'KCP Cloud DNS', country: 'IR', homepage: 'https://kcpcloud.ir/', endpoints: { ipv4: ['91.245.229.1', '91.245.229.2'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: true, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'shahrad', name: 'Shahrad DNS', country: 'IR', homepage: 'https://shahrad.net/', endpoints: { ipv4: ['185.51.200.1'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'asiatech', name: 'Asiatech DNS', country: 'IR', homepage: 'https://asiatech.ir/', endpoints: { ipv4: ['37.156.145.11', '37.156.145.12'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'tci', name: 'Telecommunication Company of Iran DNS', country: 'IR', homepage: 'https://tci.ir/', endpoints: { ipv4: ['80.191.40.41', '78.38.77.2', '78.38.100.54', '85.185.105.99'], ipv6: [] }, tags: ['iran', 'isp'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),
  provider({ id: 'fardadeh', name: 'Farabord Dadeh Iranian DNS', country: 'IR', homepage: 'https://fardadeh.ir/', endpoints: { ipv4: ['81.91.144.116', '81.91.144.162'], ipv6: [] }, tags: ['iran', 'regional'], dnssec: false, region: 'IR', discovery: 'verified-public-catalog' }),

  // Global public resolvers. This is intentionally provider-level rather than
  // an unbounded dump of every public nameserver IP. Additional public
  // nameservers can be discovered/imported into the same registry and still
  // pass through exactly the same validation/scoring pipeline.
  provider({ id: 'mullvad', name: 'Mullvad DNS', country: 'SE', homepage: 'https://mullvad.net/en/help/dns-over-https-and-dns-over-tls', endpoints: { ipv4: ['194.242.2.2'], ipv6: ['2a07:e340::2'], doh: 'https://doh.mullvad.net/dns-query', dot: 'doh.mullvad.net' }, tags: ['privacy', 'security'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'dns-watch', name: 'DNS.Watch', country: 'DE', homepage: 'https://dns.watch/', endpoints: { ipv4: ['84.200.69.80', '84.200.70.40'], ipv6: ['2001:1608:10:25::1c04:b12f', '2001:1608:10:25::9249:d69b'], doh: 'https://resolver2.dns.watch/dns-query', dot: 'resolver2.dns.watch' }, tags: ['privacy'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'uncensored-dns', name: 'UncensoredDNS', country: 'DK', homepage: 'https://blog.uncensoreddns.org/', endpoints: { ipv4: ['91.239.100.100', '89.233.43.71'], ipv6: ['2001:67c:28a4::', '2a01:3a0:53:53::'], doh: 'https://anycast.uncensoreddns.org/dns-query', dot: 'anycast.uncensoreddns.org' }, tags: ['privacy'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'quad101', name: 'Quad101', country: 'TW', homepage: 'https://quad101.net/', endpoints: { ipv4: ['101.101.101.101', '101.102.103.104'], ipv6: ['2001:de4::101', '2001:de4::102'], doh: 'https://dns-tw.neustar.biz/dns-query' }, tags: ['regional', 'security'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'verisign', name: 'Verisign Public DNS', country: 'US', homepage: 'https://www.verisign.com/en_US/security-services/public-dns/', endpoints: { ipv4: ['64.6.64.6', '64.6.65.6'], ipv6: ['2620:74:1b::1:1', '2620:74:1c::2:2'] }, tags: ['reliable'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'comodo', name: 'Comodo Secure DNS', country: 'US', homepage: 'https://www.comodo.com/secure-dns/', endpoints: { ipv4: ['8.26.56.26', '8.20.247.20'], ipv6: [] }, tags: ['security'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'alternatedns', name: 'Alternate DNS', country: 'US', homepage: 'https://alternate-dns.com/', endpoints: { ipv4: ['76.76.19.19', '76.223.122.150'], ipv6: ['2602:fcbc::ad', '2602:fcbc:2::ad'] }, tags: ['ad-blocking'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'yandex', name: 'Yandex DNS', country: 'RU', homepage: 'https://dns.yandex.com/', endpoints: { ipv4: ['77.88.8.8', '77.88.8.1'], ipv6: ['2a02:6b8::feed:0ff', '2a02:6b8:0:1::feed:0ff'], doh: 'https://common.dot.dns.yandex.net/dns-query', dot: 'common.dot.dns.yandex.net' }, tags: ['security'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'he', name: 'Hurricane Electric DNS', country: 'US', homepage: 'https://dns.he.net/', endpoints: { ipv4: ['74.82.42.42'], ipv6: ['2001:470:20::2'] }, tags: ['reliable'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'neustar', name: 'Neustar UltraRecursive', country: 'US', homepage: 'https://www.security.neustar/', endpoints: { ipv4: ['64.6.64.6', '64.6.65.6'], ipv6: [] }, tags: ['security'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'wikimedia', name: 'Wikimedia DNS', country: 'US', homepage: 'https://wikimediafoundation.org/', endpoints: { ipv4: ['185.71.138.138'], ipv6: ['2001:67c:930::1'] }, tags: ['privacy'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'dns4eu', name: 'DNS4EU', country: 'EU', homepage: 'https://www.joindns4.eu/', endpoints: { ipv4: ['86.54.11.1', '86.54.11.100'], ipv6: ['2a13:1001::86:54:11:1', '2a13:1001::86:54:11:100'], doh: 'https://protective.joindns4.eu/dns-query', dot: 'protective.joindns4.eu' }, tags: ['europe', 'security'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'opennic', name: 'OpenNIC', country: 'global', homepage: 'https://www.opennic.org/', endpoints: { ipv4: ['147.182.243.49'], ipv6: [] }, tags: ['community'], dnssec: false, region: 'global', discovery: 'curated' }),
  provider({ id: 'greenteamdns', name: 'GreenTeamDNS', country: 'US', homepage: 'https://www.greentm.com/', endpoints: { ipv4: ['81.218.119.11', '209.88.198.133'], ipv6: [] }, tags: ['filtering'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'safedns', name: 'SafeDNS', country: 'US', homepage: 'https://www.safedns.com/', endpoints: { ipv4: ['195.46.39.39', '195.46.39.40'], ipv6: [] }, tags: ['filtering'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'freedns', name: 'FreeDNS', country: 'US', homepage: 'https://freedns.controld.com/', endpoints: { ipv4: ['37.235.1.174', '37.235.1.177'], ipv6: [] }, tags: ['community'], dnssec: true, region: 'global', discovery: 'curated' }),
  provider({ id: 'cloudns', name: 'ClouDNS', country: 'US', homepage: 'https://www.cloudns.net/', endpoints: { ipv4: ['82.200.69.80', '78.47.64.161'], ipv6: [] }, tags: ['reliable'], dnssec: true, region: 'global', discovery: 'curated' }),
];

export const IRANIAN_PROVIDER_METADATA = EXTENDED_PROVIDER_METADATA.filter(
  (entry) => entry.region === 'IR',
);

export const GLOBAL_PROVIDER_METADATA = EXTENDED_PROVIDER_METADATA.filter(
  (entry) => entry.region === 'global',
);

export const PROVIDER_CATALOG = EXTENDED_PROVIDER_METADATA;
