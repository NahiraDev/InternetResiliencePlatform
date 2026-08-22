import { createHash, createPublicKey, generateKeyPairSync, randomUUID, sign, verify, type KeyObject } from 'node:crypto';

export type ProbeStatus = 'active' | 'revoked';
export interface ProbeRegistration { probeId: string; name: string; region: string; publicKeyPem: string; createdAt: string; status: ProbeStatus; lastSeenAt?: string }
export interface ProbeEvidence { evidenceId: string; probeId: string; region: string; observedAt: string; destination: string; serviceStatus: 'reachable' | 'degraded' | 'unreachable' | 'unknown'; measurements: { latencyMs?: number; jitterMs?: number; packetLossPercent?: number; dnsLatencyMs?: number; tcpLatencyMs?: number; tlsLatencyMs?: number; httpLatencyMs?: number }; metadata?: Record<string, string | number | boolean> }
export interface SignedProbeEvidence { payload: ProbeEvidence; signature: string }
export interface FederationLimits { maxEvidencePerProbe: number; maxEvidenceTotal: number; maxEvidenceAgeMs: number; maxClockSkewMs: number }
export interface FederationIngestResult { accepted: boolean; reason?: 'unknown-probe'|'revoked-probe'|'invalid-signature'|'invalid-timestamp'|'replayed-evidence'|'capacity-limit'; evidenceId: string }
export interface DestinationComparison { destination: string; observedAt: string; observations: Array<{ probeId: string; region: string; serviceStatus: ProbeEvidence['serviceStatus']; measurements: ProbeEvidence['measurements'] }>; reachableCount: number; degradedCount: number; unreachableCount: number; agreement: 'consistent'|'mixed'|'insufficient' }

const DEFAULT_LIMITS: FederationLimits = { maxEvidencePerProbe: 500, maxEvidenceTotal: 5000, maxEvidenceAgeMs: 15*60_000, maxClockSkewMs: 5*60_000 };
const MAX_STRING=256, MAX_METADATA=16, MAX_METADATA_VALUE=256;
const bounded=(v:string)=>v.trim().slice(0,MAX_STRING);
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
const bytes=(p:ProbeEvidence)=>Buffer.from(JSON.stringify(canonical(p)),'utf8');
const digest=(p:ProbeEvidence)=>createHash('sha256').update(bytes(p)).digest('hex');
const keyOf=(pem:string):KeyObject|null=>{try{return createPublicKey(pem)}catch{return null}};
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const valid=(p:ProbeEvidence):boolean=>{
  if(!p||!p.evidenceId||!p.probeId||!p.region||!p.destination||[p.evidenceId,p.probeId,p.region,p.destination].some(v=>v.length>MAX_STRING)||!Number.isFinite(Date.parse(p.observedAt))) return false;
  if(!['reachable','degraded','unreachable','unknown'].includes(p.serviceStatus)) return false;
  const ranges:Record<string,[number,number]>={latencyMs:[0,300000],jitterMs:[0,300000],packetLossPercent:[0,100],dnsLatencyMs:[0,300000],tcpLatencyMs:[0,300000],tlsLatencyMs:[0,300000],httpLatencyMs:[0,300000]};
  for(const [k,v] of Object.entries(p.measurements??{})){const r=ranges[k];if(!r||!finite(v,r[0],r[1]))return false}
  const m=Object.entries(p.metadata??{});return m.length<=MAX_METADATA&&!m.some(([k,v])=>k.length>MAX_STRING||String(v).length>MAX_METADATA_VALUE);
};
export const createProbeKeyPair=()=>{const p=generateKeyPairSync('ed25519');return{publicKeyPem:p.publicKey.export({type:'spki',format:'pem'}).toString(),privateKeyPem:p.privateKey.export({type:'pkcs8',format:'pem'}).toString()}};
export const signProbeEvidence=(payload:ProbeEvidence,privateKeyPem:string):SignedProbeEvidence=>({payload,signature:sign(null,bytes(payload),privateKeyPem).toString('base64url')});

export class ProbeFederation {
 private readonly probes=new Map<string,ProbeRegistration>(); private readonly evidence=new Map<string,SignedProbeEvidence>(); private readonly perProbe=new Map<string,string[]>(); private readonly seen=new Set<string>(); private readonly keys=new Map<string,KeyObject>(); private readonly limits:FederationLimits;
 constructor(limits:Partial<FederationLimits>={}){this.limits={...DEFAULT_LIMITS,...limits};for(const [k,v] of Object.entries(this.limits))if(!Number.isInteger(v)||v<1)throw new Error(`Invalid federation limit: ${k}`)}
 registerProbe(input:Omit<ProbeRegistration,'createdAt'|'status'>){if(!/^[a-zA-Z0-9._:-]{1,128}$/.test(input.probeId))throw new Error('Invalid probeId.');const name=bounded(input.name),region=bounded(input.region),key=keyOf(input.publicKeyPem);if(!name||!region||!key)throw new Error('Invalid probe registration.');const old=this.probes.get(input.probeId);if(old&&old.publicKeyPem!==input.publicKeyPem)throw new Error('Probe key replacement requires explicit revocation.');const p=old??{probeId:input.probeId,name,region,publicKeyPem:input.publicKeyPem,createdAt:new Date().toISOString(),status:'active' as const};this.probes.set(input.probeId,p);this.keys.set(input.probeId,key);return{...p}}
 revokeProbe(id:string){const p=this.probes.get(id);if(!p||p.status==='revoked')return false;p.status='revoked';this.probes.set(id,p);return true}
 listProbes(){return[...this.probes.values()].map(p=>({...p}))}
 ingest(s:SignedProbeEvidence,now=Date.now()):FederationIngestResult{const p=s?.payload,id=p?.evidenceId??'unknown',probe=p?this.probes.get(p.probeId):undefined;if(!probe)return{accepted:false,reason:'unknown-probe',evidenceId:id};if(probe.status!=='active')return{accepted:false,reason:'revoked-probe',evidenceId:id};if(!valid(p))return{accepted:false,reason:'invalid-signature',evidenceId:id};const t=Date.parse(p.observedAt);if(Math.abs(now-t)>this.limits.maxClockSkewMs||now-t>this.limits.maxEvidenceAgeMs)return{accepted:false,reason:'invalid-timestamp',evidenceId:id};const key=this.keys.get(p.probeId)??keyOf(probe.publicKeyPem);if(!key||!verify(null,bytes(p),key,Buffer.from(s.signature,'base64url')))return{accepted:false,reason:'invalid-signature',evidenceId:id};const d=digest(p),list=this.perProbe.get(p.probeId)??[];if(this.seen.has(d)||this.evidence.has(id))return{accepted:false,reason:'replayed-evidence',evidenceId:id};if(this.evidence.size>=this.limits.maxEvidenceTotal||list.length>=this.limits.maxEvidencePerProbe)return{accepted:false,reason:'capacity-limit',evidenceId:id};this.evidence.set(id,{payload:{...p,measurements:{...p.measurements}},signature:s.signature});list.push(id);this.perProbe.set(p.probeId,list);this.seen.add(d);probe.lastSeenAt=new Date(now).toISOString();this.probes.set(probe.probeId,probe);return{accepted:true,evidenceId:id}}
 listEvidence(o:{destination?:string;probeId?:string;limit?:number}={}){const n=Math.min(Math.max(o.limit??100,1),this.limits.maxEvidenceTotal);return[...this.evidence.values()].filter(x=>!o.destination||x.payload.destination===o.destination).filter(x=>!o.probeId||x.payload.probeId===o.probeId).sort((a,b)=>Date.parse(b.payload.observedAt)-Date.parse(a.payload.observedAt)).slice(0,n).map(x=>({payload:{...x.payload,measurements:{...x.payload.measurements}},signature:x.signature}))}
 compareDestination(destination:string,limit=100):DestinationComparison{const a=this.listEvidence({destination,limit}),r=a.filter(x=>x.payload.serviceStatus==='reachable').length,d=a.filter(x=>x.payload.serviceStatus==='degraded').length,u=a.filter(x=>x.payload.serviceStatus==='unreachable').length,states=[r,d,u].filter(x=>x>0).length;return{destination:bounded(destination),observedAt:a[0]?.payload.observedAt??new Date(0).toISOString(),observations:a.map(x=>({probeId:x.payload.probeId,region:x.payload.region,serviceStatus:x.payload.serviceStatus,measurements:{...x.payload.measurements}})),reachableCount:r,degradedCount:d,unreachableCount:u,agreement:a.length<2?'insufficient':states<=1?'consistent':'mixed'}}
 stats(){return{probeCount:this.probes.size,activeProbeCount:[...this.probes.values()].filter(p=>p.status==='active').length,evidenceCount:this.evidence.size}}
 createLocalEvidence(input:Omit<ProbeEvidence,'evidenceId'>){return{...input,evidenceId:randomUUID()}}
}
