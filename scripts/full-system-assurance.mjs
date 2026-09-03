import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const contract = JSON.parse(await readFile(join(root, 'ops/release/full-system-assurance.json'), 'utf8'));
const outputDir = join(root, process.env.IRP_FULL_SYSTEM_OUTPUT ?? 'artifacts/full-system-assurance');
const rows = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build', '.turbo'].includes(entry.name)) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function capabilityFor(id) {
  const value = id.toLowerCase();
  const rules = [
    ['resilience-runtime','resilience-runtime'],['network-intelligence','network-intelligence'],['connectivity','connectivity'],['dns','dns'],['gateway-registry','gateway-registry'],['routing','routing'],['failover','failover'],['tunnel','tunnel'],['database','database'],['api','api'],['daemon','daemon'],['security','security'],['telemetry','telemetry'],['linux-client','linux-client'],['macos-client','macos-client'],['windows-client','windows-client'],['android','android-client'],['ios-network-extension','ios-network-extension'],['ios','ios-client'],['observability','observability'],['docker','docker'],['kubernetes','kubernetes'],['regional','regional-validation'],['release','release-engineering'],['backup','backup-restore'],['rollback','upgrade-rollback'],['chaos','chaos-soak'],['control','control-plane']
  ];
  if (value.includes('infra') || value.includes('docker')) return 'docker';
  if (value.includes('k8s') || value.includes('kubernetes')) return 'kubernetes';
  if (value.includes('ops/observability') || value.includes('observability')) return 'observability';
  if (value.includes('ops/release') || value.includes('release')) return 'release-engineering';
  if (value.includes('regional')) return 'regional-validation';
  if (value.includes('backup')) return 'backup-restore';
  if (value.includes('rollback')) return 'upgrade-rollback';
  if (value.includes('chaos') || value.includes('soak')) return 'chaos-soak';
  return rules.find(([needle]) => value.includes(needle))?.[1] ?? 'other';
}

async function addSurface(path, type, packageJson = null) {
  const abs = join(root, path);
  const isDir = existsSync(abs) && statSync(abs).isDirectory();
  const files = isDir ? await walk(abs) : [abs];
  const sourceFiles = files.filter((file) => /\.(ts|tsx|js|mjs|cjs|swift|kt|kts|sh|sql)$/.test(file)).length;
  const scripts = packageJson?.scripts ?? {};
  const entrypoint = scripts.start ?? scripts.dev ?? (existsSync(join(abs, 'src/index.ts')) ? 'src/index.ts' : null);
  const executable = Boolean(entrypoint) || ['app','android-client','ios-client','ios-network-extension','workflow','operations','infrastructure'].includes(type);
  const realStatus = executable ? 'BLOCKED' : 'PENDING';
  rows.push({ componentId:path.replaceAll('/','::'), path, type, capability:capabilityFor(path), executable, entrypoint, buildCommand:scripts.build??null, testCommand:scripts.test??null, sourceFiles, upstreamDependencies:packageJson?Object.keys({...packageJson.dependencies??{},...packageJson.devDependencies??{}}):[], downstreamDependencies:[], owningPhases:[], realEnvironment:{status:realStatus,assurancePath:null,failureInjection:null,recoveryVerification:null,telemetryEvidence:null}, evidenceId:null });
}

for (const top of ['packages','apps']) {
  if (!existsSync(join(root,top))) continue;
  for (const entry of await readdir(join(root,top),{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const path=`${top}/${entry.name}`;
    const manifest=join(root,path,'package.json');
    await addSurface(path,top==='apps'?'app':'package',existsSync(manifest)?await readJson(manifest):null);
  }
}
for (const path of ['clients/android','clients/ios','clients/ios/PacketTunnel']) if (existsSync(join(root,path))) await addSurface(path,path.includes('PacketTunnel')?'ios-network-extension':path.includes('android')?'android-client':'ios-client');
for (const path of ['infra','ops']) if (existsSync(join(root,path))) await addSurface(path,'operations');
const workflowDir=join(root,'.github/workflows');
if (existsSync(workflowDir)) for (const file of await readdir(workflowDir)) if (/\.(yml|yaml)$/.test(file)) await addSurface(`.github/workflows/${file}`,'workflow');

const phaseDocs=[];
const phaseDir=join(root,'docs/phases');
if (existsSync(phaseDir)) for (const file of await readdir(phaseDir)) { const m=/^phase-(\d+)\.md$/.exec(file); if(m) phaseDocs.push(Number(m[1])); }
const missingPhaseDocs=[];
for(let n=0;n<=contract.roadmap.maxPhase;n++) if(!phaseDocs.includes(n)) missingPhaseDocs.push(n);
for(let n=0;n<=contract.roadmap.maxPhase;n++) rows.push({componentId:`roadmap::phase-${n}`,path:missingPhaseDocs.includes(n)?`docs/phases/phase-${n}.md`:`docs/phases/phase-${n}.md`,type:'roadmap-phase',capability:'release-engineering',executable:false,entrypoint:null,buildCommand:null,testCommand:null,sourceFiles:0,upstreamDependencies:[],downstreamDependencies:[],owningPhases:[n],realEnvironment:{status:missingPhaseDocs.includes(n)?'BLOCKED':'PENDING',assurancePath:null,failureInjection:null,recoveryVerification:null,telemetryEvidence:null},evidenceId:null});

const discoveredCapabilities=new Set(rows.map(r=>r.capability));
const missingCapabilities=contract.requiredCapabilitySurfaces.filter(c=>!discoveredCapabilities.has(c));
const noAssurance=rows.filter(r=>r.executable&&!r.realEnvironment.assurancePath);
const report={schemaVersion:1,generatedAt:new Date().toISOString(),commitSha:process.env.GITHUB_SHA??'unknown',repositoryScope:contract.sourceOfTruth,componentCount:rows.length,sourceFileCount:rows.reduce((n,r)=>n+r.sourceFiles,0),components:rows,roadmap:{expectedThrough:contract.roadmap.maxPhase,discoveredPhaseDocs:phaseDocs.sort((a,b)=>a-b),missingPhaseDocs},requiredCapabilitySurfaces:contract.requiredCapabilitySurfaces,missingCapabilitySurfaces:missingCapabilities,closedLoopStages:contract.requiredClosedLoopStages,verdict:missingCapabilities.length?'BLOCKED':noAssurance.length||missingPhaseDocs.length?'BLOCKED':'PASS',failures:[],blocked:[...missingPhaseDocs.map(n=>`phase-${n}: roadmap phase document is missing`),...noAssurance.map(r=>`${r.path}: no concrete real-environment assurance adapter is registered`),...missingCapabilities.map(c=>`${c}: capability surface has no discovered repository owner`)],executableComponentsWithoutAssurance:noAssurance.length,reportSha256:null};
report.reportSha256=hash(JSON.stringify({...report,reportSha256:null}));
await mkdir(outputDir,{recursive:true});
await writeFile(join(outputDir,'system-matrix.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
await writeFile(join(outputDir,'system-matrix.sha256'),`${hash(JSON.stringify(report))}  system-matrix.json\n`,'utf8');
console.log(`FULL SYSTEM ASSURANCE MATRIX: ${report.verdict}`);
console.log(`Components/phases: ${report.componentCount}; source files represented: ${report.sourceFileCount}`);
console.log(`Missing phase docs: ${missingPhaseDocs.length}; executable surfaces without assurance: ${noAssurance.length}`);
// BLOCKED is an honest inventory state, not a CI failure. Production certification remains fail-closed.
