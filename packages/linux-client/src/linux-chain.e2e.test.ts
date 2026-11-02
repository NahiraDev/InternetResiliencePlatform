/**
 * End-to-end proof of the canonical Linux execution chain, against a real kernel:
 *
 *   Observation -> Diagnosis -> Intent -> Decision -> Policy -> Security -> Safety -> Plan
 *     -> Transaction -> Kernel -> Destination verification -> Commit | Rollback
 *
 * What is real: two network namespaces joined by a veth pair, kernel routing tables mutated by
 * `LinuxRouteExecutor` (`ip route replace/del`), a TCP listener in the destination namespace, a TCP
 * probe run from inside the source namespace, and the production `ResilienceRuntime` in live mode
 * (observation, incident correlation, decision provider, planner, policy/security/safety gates,
 * privileged mutation boundary, adapter registry, routing engine, kernel contract).
 *
 * What is supplied by the test: the observation provider (a real probe of the destination), and a
 * discovery provider that offers the candidate path. Nothing on the apply, verify or rollback side
 * is faked.
 *
 * Host safety: every `ip` command targets a lab namespace. A fingerprint of the host's routes,
 * addresses and resolv.conf is taken before and compared after every scenario.
 *
 * Capability handling: when the lab cannot be built (no `ip`, no CAP_NET_ADMIN/CAP_SYS_ADMIN, or the
 * kernel refuses namespaces/veth) the lab scenarios are reported as SKIPPED with the exact reasons,
 * never as passed. Set IRP_REQUIRE_NETNS_E2E=1 (CI jobs that must prove the chain) to turn that
 * into a hard failure instead.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDestination, type RouteDiscoveryProvider } from '@irp/routing';
import {
  CanonicalDecisionProvider,
  createCanonicalRuntime,
  type ObservationProvider,
  type PathStrategyEvidence,
  type ResilienceRuntime,
} from '@irp/resilience-runtime';
import { createLinuxNetworkControlPlane, type LinuxNetworkControlPlane } from './linux-network-control-plane.js';
import { LinuxTcpDestinationProbe } from './linux-destination-probe.js';
import { ExecFileRouteCommandRunner, LinuxRouteExecutor } from './linux-route-executor.js';
import { FileRouteJournal } from './route-journal.js';
import {
  LAB_DST_LINK_ADDR,
  LAB_SRC_DEV,
  createNetnsLab,
  detectNetnsLabSupport,
  type NetnsLab,
} from './netns-lab.js';

const execFileAsync = promisify(execFile);
const REQUIRE_LAB = process.env.IRP_REQUIRE_NETNS_E2E === '1';
const support = await detectNetnsLabSupport();

type Intent = Parameters<ResilienceRuntime['runIntent']>[0];

describe('netns lab capability detection', () => {
  it('states exactly why the lab cannot run, or that it can', () => {
    if (support.supported) expect(support.reasons).toEqual([]);
    else expect(support.reasons.length).toBeGreaterThan(0);
  });

  it.runIf(REQUIRE_LAB)('fails instead of skipping when IRP_REQUIRE_NETNS_E2E=1 and the lab is unavailable', () => {
    expect(support.reasons, `the netns lab is required but unavailable: ${support.reasons.join('; ')}`).toEqual([]);
  });

  it('reports a missing `ip` binary as a named reason, not as a generic failure', async () => {
    const original = process.env.PATH;
    process.env.PATH = '/nonexistent-irp-path';
    try {
      const result = await detectNetnsLabSupport();
      expect(result.supported).toBe(false);
      expect(result.reasons.join(' ')).toMatch(/`ip` \(iproute2\) binary is not installed/);
    } finally {
      process.env.PATH = original;
    }
  });
});

const labDescribe = support.supported
  ? describe
  : describe.skip.bind(describe, `LAB UNAVAILABLE, scenarios NOT run: ${support.reasons.join('; ')}`);

const hostFingerprint = async (): Promise<string> => {
  const sh = async (args: string[]) =>
    (await execFileAsync('ip', args, { timeout: 5_000 }).catch(() => ({ stdout: 'n/a' }))).stdout;
  return [
    await sh(['route', 'show', 'table', 'all']),
    await sh(['-6', 'route', 'show', 'table', 'all']),
    await sh(['-brief', 'address']),
    await sh(['rule', 'show']),
    existsSync('/etc/resolv.conf') ? readFileSync('/etc/resolv.conf', 'utf8') : 'no resolv.conf',
  ].join('\n--\n');
};

const LIVE_ALLOWED = [
  'health_reprobe',
  'noop',
  'degraded_mode',
  'recovery',
  'rollback',
  'route_change',
  'connectivity_failover',
] as const;

/** Index of each wanted event in order; fails if one is missing or out of order. */
const expectEventsInOrder = (events: readonly string[], wanted: readonly string[]): void => {
  let from = 0;
  for (const name of wanted) {
    const at = events.indexOf(name, from);
    expect(at, `event ${name} missing or out of order in: ${events.join(' > ')}`).toBeGreaterThanOrEqual(0);
    from = at + 1;
  }
};

labDescribe('canonical Linux chain in a real network namespace', () => {
  let lab: NetnsLab;
  let stateDir: string;
  let hostBefore: string;
  let plane: LinuxNetworkControlPlane;

  beforeEach(async () => {
    hostBefore = await hostFingerprint();
    lab = await createNetnsLab();
    stateDir = mkdtempSync(join(tmpdir(), 'irp-e2e-state-'));
  });

  afterEach(async () => {
    await lab.teardown();
    rmSync(stateDir, { recursive: true, force: true });
    // The host's own networking must be byte-for-byte what it was.
    expect(await hostFingerprint()).toBe(hostBefore);
  });

  const probeFromSrc = () => new LinuxTcpDestinationProbe({ port: lab.port, netns: lab.srcNs, timeoutMs: 1_500 });

  /** Composes the production runtime over the lab. `trust` models what the host granted. */
  const compose = (trust: { capabilities: string[]; allowedActions: readonly string[] }) => {
    const probe = probeFromSrc();
    plane = createLinuxNetworkControlPlane({
      enableLiveRouteMutation: true,
      netns: lab.srcNs,
      registerStarlink: false,
      stateDirectory: stateDir,
      destinationProbe: { port: lab.port, timeoutMs: 1_500 },
    });
    // The source namespace has no route to the destination; this provider offers the alternate
    // path, exactly as a connectivity-derived provider would. Apply/verify/rollback hit the kernel.
    const candidatePath: RouteDiscoveryProvider = {
      id: 'lab-candidate-paths',
      discoverRoutes: async () => [
        {
          destination: `${lab.destination}/32`,
          prefix: 32,
          gateway: LAB_DST_LINK_ADDR,
          interfaceName: LAB_SRC_DEV,
          protocol: 'static',
          metric: 50,
          family: 'ipv4',
          scope: 'global',
          state: 'active',
          table: { id: 'main', kind: 'main', name: 'main' },
          capabilities: ['ipv4'],
          metadata: { pathType: 'direct' },
        },
      ],
    };
    plane.routing.registerProvider(candidatePath);

    const observer: ObservationProvider = {
      id: 'lab-destination-observer',
      collect: async (ctx) => {
        const result = await probe.probe(lab.destination);
        const now = new Date().toISOString();
        const ok = result.outcome === 'connected';
        return {
          providerId: 'lab-destination-observer',
          collectedAt: now,
          errors: [],
          observations: [
            {
              id: `obs-${ctx.correlationId}`,
              schemaVersion: 1,
              createdAt: now,
              correlationId: ctx.correlationId,
              source: 'lab-destination-observer',
              metadata: { destination: lab.destination, probeOutcome: result.outcome, code: result.code ?? null },
              category: 'network',
              metric: 'destination_reachable',
              value: ok,
              timestamp: now,
              freshnessMs: 0,
              confidence: 0.95,
              severity: ok ? 'info' : 'critical',
              status: ok ? 'healthy' : 'failed',
            },
          ],
        };
      },
    };

    const pathEvidence = {
      evaluate: async (): Promise<PathStrategyEvidence | undefined> => {
        await plane.connectivity.discoverResources();
        const decision = await plane.routing.simulateRouting({
          destination: parseDestination(lab.destination),
          connectivitySources: plane.connectivity.getAvailableSources(),
        });
        if (!decision.selected) return undefined;
        return {
          destination: lab.destination,
          recommendation: 'switch',
          selectedPathId: decision.selected.path.id,
          candidatePaths: [],
          diverseAlternativeCount: 0,
          confidence: 0.9,
          expectedBenefit: 0.9,
          risk: 0.1,
          explanation: ['routing engine selected an eligible path to the destination'],
        };
      },
    };

    const { runtime } = createCanonicalRuntime({
      executionMode: 'real',
      runtimeId: 'netns-e2e-runtime',
      observationProviders: [observer],
      hostTrust: { principal: 'netns-e2e-host', capabilities: trust.capabilities, allowedActions: [...trust.allowedActions] as never },
      decisionProvider: new CanonicalDecisionProvider(undefined, { pathEvidence }),
      networkControlPlane: { ...plane.controlPlane, destination: parseDestination(lab.destination) },
    });
    return { runtime, probe };
  };

  const intent = (): Intent => ({
    id: 'intent-e2e-reach-destination',
    version: 1,
    status: 'active',
    priority: 'high',
    spec: { outcome: 'reach the lab destination', target: { destination: lab.destination } },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    autonomy: 'AUTONOMOUS',
  });

  const fullTrust = { capabilities: ['network.observe', 'route.write', 'connectivity.failover'], allowedActions: LIVE_ALLOWED };
  const journalEntries = () => new FileRouteJournal(join(stateDir, 'route-journal')).list().entries;

  it('commits: a real observed outage is diagnosed, routed in the kernel, verified at the destination, and committed', async () => {
    await lab.startListener();
    const { runtime, probe } = compose(fullTrust);

    // Precondition, observed independently of the runtime: no route, destination unreachable.
    expect(await lab.destinationRoutes()).toEqual([]);
    expect((await probe.probe(lab.destination)).outcome).toBe('unreachable');

    const record = await runtime.runIntent(intent(), { mode: 'live' });
    const events = runtime.events.events.map((e) => e.event);

    // Observation -> Diagnosis
    const observation = record.observations.observations.find((o) => o.metric === 'destination_reachable');
    expect(observation).toMatchObject({ value: false, status: 'failed', metadata: { probeOutcome: 'unreachable', code: 'ENETUNREACH' } });
    expect(record.incidents).toHaveLength(1);
    // Intent -> Decision -> Policy -> Plan
    expect(record.runtimeContext.compiledIntents?.[0]?.intentId).toBe('intent-e2e-reach-destination');
    expect(record.selectedPlan?.selectedAction.intent).toBe('route_change');
    expect(record.policyEvaluation.allowed).toBe(true);
    expect(record.validation?.valid).toBe(true);

    // Security -> Safety -> Transaction -> Kernel -> Destination verification -> Commit
    expectEventsInOrder(events, [
      'runtime.observation.updated',
      'runtime.incident.detected',
      'runtime.candidate.generated',
      'runtime.plan.created',
      'runtime.safety.assessed',
      'runtime.transaction.created',
      'runtime.execution.started',
      'runtime.mutation.applying',
      'runtime.mutation.committed',
      'runtime.verification.completed',
    ]);
    expect(events).not.toContain('runtime.mutation.rolledback');
    expect(events).not.toContain('runtime.mutation.recovered');
    expect(runtime.events.events.find((e) => e.event === 'runtime.safety.assessed')?.payload).toMatchObject({ allowed: true });

    expect(record.outcome).toBe('success');
    expect(record.executionResult).toMatchObject({ status: 'success', simulated: false });
    expect(record.verificationResult?.status).toBe('success');

    // Kernel truth, read independently of the executor: the exact planned route is installed.
    expect(await lab.destinationRoutes()).toEqual([
      expect.objectContaining({ dst: lab.destination, gateway: LAB_DST_LINK_ADDR, dev: LAB_SRC_DEV, metric: 50 }),
    ]);
    // And the destination is genuinely reachable over it.
    expect((await probe.probe(lab.destination)).outcome).toBe('connected');
    // The journal records the change as confirmed, so a restart keeps it.
    expect(journalEntries().map((e) => e.state)).toEqual(['verified']);
  }, 60_000);

  it('keeps a committed route across a restart instead of reverting it', async () => {
    await lab.startListener();
    const { runtime } = compose(fullTrust);
    expect((await runtime.runIntent(intent(), { mode: 'live' })).outcome).toBe('success');

    // A new executor over the same on-disk journal is what a restarted daemon constructs.
    const restarted = new LinuxRouteExecutor(new ExecFileRouteCommandRunner(), {
      netns: lab.srcNs,
      journal: new FileRouteJournal(join(stateDir, 'route-journal')),
    });
    const report = await restarted.recoverInterrupted();
    expect(report.rolledBack).toEqual([]);
    expect(report.failed).toEqual([]);
    expect(await lab.destinationRoutes()).toHaveLength(1);
  }, 60_000);

  it('rolls back: when the destination fails verification the kernel route is removed and the original state restored', async () => {
    // The route will apply fine, but nothing listens at the destination: the TCP probe is refused.
    const { runtime, probe } = compose(fullTrust);
    expect(await lab.destinationRoutes()).toEqual([]);

    const record = await runtime.runIntent(intent(), { mode: 'live' });
    const events = runtime.events.events.map((e) => e.event);

    // The kernel mutation really happened and the routing layer accepted it...
    expect(record.executionResult).toMatchObject({ status: 'success', simulated: false });
    // ...but the destination did not verify, so the transaction must not commit.
    expectEventsInOrder(events, [
      'runtime.transaction.created',
      'runtime.mutation.applying',
      'runtime.safety.rollback.started',
      'runtime.safety.rollback.completed',
      'runtime.mutation.rolledback',
    ]);
    expect(events).not.toContain('runtime.mutation.committed');
    expect(events).not.toContain('runtime.safety.rollback.failed');
    expect(record.outcome).toBe('recovered');

    // Kernel truth: the route is gone and the namespace is back to its starting state.
    expect(await lab.destinationRoutes()).toEqual([]);
    expect((await probe.probe(lab.destination)).outcome).toBe('unreachable');
    // The journal holds nothing to replay: a restart has nothing to revert or keep.
    expect(journalEntries()).toEqual([]);
  }, 60_000);

  it('does not report a rollback it cannot prove', async () => {
    const { runtime, probe } = compose(fullTrust);
    // Break the proof, not the mutation: shadow the observer on this one provider instance so no
    // provider can confirm the rollback from kernel state. The route removal itself still runs.
    const providers = (plane.routing as unknown as { providers: { verifyRolledBack?: unknown }[] }).providers;
    for (const provider of providers) provider.verifyRolledBack = undefined;

    const record = await runtime.runIntent(intent(), { mode: 'live' });
    const events = runtime.events.events.map((e) => e.event);
    console.info(`[unproven-rollback] outcome=${record.outcome} events=${events.slice(events.indexOf('runtime.mutation.applying')).join(' > ')} routes=${JSON.stringify(await lab.destinationRoutes())} probe=${(await probe.probe(lab.destination)).outcome}`);
    // Without proof the boundary must not announce a clean rollback, and must not commit.
    expect(events).not.toContain('runtime.mutation.rolledback');
    expect(events).not.toContain('runtime.mutation.committed');
    expect(events).toContain('runtime.safety.rollback.started');
    expect(record.outcome).not.toBe('success');
  }, 60_000);

  it('policy gate: an action the host did not allow never reaches the kernel', async () => {
    await lab.startListener();
    const { runtime } = compose({
      capabilities: ['network.observe', 'route.write'],
      allowedActions: ['health_reprobe', 'noop'],
    });
    const record = await runtime.runIntent(intent(), { mode: 'live' });
    expect(record.outcome).not.toBe('success');
    expect(runtime.events.events.map((e) => e.event)).not.toContain('runtime.mutation.applying');
    expect(await lab.destinationRoutes()).toEqual([]);
  }, 60_000);

  it('security gate: without the route.write capability the mutation is denied before the kernel', async () => {
    await lab.startListener();
    const { runtime } = compose({ capabilities: ['network.observe'], allowedActions: LIVE_ALLOWED });
    const record = await runtime.runIntent(intent(), { mode: 'live' });
    expect(record.outcome).not.toBe('success');
    expect(runtime.events.events.map((e) => e.event)).not.toContain('runtime.mutation.applying');
    expect(await lab.destinationRoutes()).toEqual([]);
  }, 60_000);

  it('simulation never touches the kernel even with full trust', async () => {
    await lab.startListener();
    const { runtime } = compose(fullTrust);
    const record = await runtime.runIntent(intent(), { mode: 'simulation' });
    expect(record.outcome).toBe('simulated');
    expect(await lab.destinationRoutes()).toEqual([]);
  }, 60_000);
});
