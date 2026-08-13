import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { InternetResiliencePlugin, PluginManifest } from '@irp/plugin-sdk';
export class PluginManifestValidator {
  validate(manifest: PluginManifest, platformVersion = '0.1.0'): void {
    const required: (keyof PluginManifest)[] = [
      'id',
      'name',
      'displayName',
      'version',
      'description',
      'author',
      'license',
      'engineVersion',
      'minimumPlatformVersion',
      'permissions',
      'dependencies',
      'optionalDependencies',
      'entry',
      'activationEvents',
      'capabilities',
    ];
    for (const key of required)
      if (manifest[key] === undefined) throw new Error(`Manifest missing ${String(key)}`);
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(manifest.id)) throw new Error('Invalid plugin id');
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) throw new Error('Invalid semantic version');
    if (compareVersions(platformVersion, manifest.minimumPlatformVersion) < 0)
      throw new Error(`Platform ${platformVersion} is below ${manifest.minimumPlatformVersion}`);
  }
  checksum(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }
  validateChecksum(manifest: PluginManifest, content: string | Buffer): void {
    if (manifest.checksum && manifest.checksum !== this.checksum(content))
      throw new Error(`Checksum mismatch for ${manifest.id}`);
  }
}
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
};
export class DependencyResolver {
  order(manifests: PluginManifest[]): PluginManifest[] {
    const byId = new Map(manifests.map((m) => [m.id, m]));
    const temp = new Set<string>();
    const perm = new Set<string>();
    const out: PluginManifest[] = [];
    const visit = (m: PluginManifest): void => {
      if (perm.has(m.id)) return;
      if (temp.has(m.id)) throw new Error(`Circular plugin dependency involving ${m.id}`);
      temp.add(m.id);
      for (const dep of m.dependencies) {
        const found = byId.get(dep.id);
        if (!found) throw new Error(`Missing dependency ${dep.id} for ${m.id}`);
        if (!satisfies(found.version, dep.version))
          throw new Error(`Dependency ${dep.id} ${found.version} does not satisfy ${dep.version}`);
        visit(found);
      }
      temp.delete(m.id);
      perm.add(m.id);
      out.push(m);
    };
    manifests.forEach(visit);
    return out;
  }
}
export const satisfies = (version: string, range: string): boolean =>
  range.startsWith('^')
    ? version.split('.')[0] === range.slice(1).split('.')[0] &&
      compareVersions(version, range.slice(1)) >= 0
    : range.startsWith('>=')
      ? compareVersions(version, range.slice(2)) >= 0
      : version === range;
export class PluginDiscovery {
  constructor(private readonly directories: string[]) {}
  async discover(): Promise<string[]> {
    const manifests: string[] = [];
    for (const dir of this.directories) {
      try {
        for (const item of await readdir(dir)) {
          const p = path.join(dir, item);
          const s = await stat(p);
          if (s.isDirectory()) manifests.push(path.join(p, 'plugin.json'));
          else if (item.endsWith('.plugin.json')) manifests.push(p);
        }
      } catch {
        /* directory optional */
      }
    }
    return manifests;
  }
  async loadManifest(file: string): Promise<PluginManifest> {
    return JSON.parse(await readFile(file, 'utf8')) as PluginManifest;
  }
}
export type PluginFactory = () => InternetResiliencePlugin | Promise<InternetResiliencePlugin>;
