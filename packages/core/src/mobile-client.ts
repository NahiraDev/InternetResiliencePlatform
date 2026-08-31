export type MobilePlatform = 'ios' | 'android';
export type MobileConnectionState = 'unknown' | 'online' | 'degraded' | 'offline';

export type MobileNetworkSnapshot = {
  platform: MobilePlatform;
  connection: MobileConnectionState;
  interfaceCount: number;
  defaultRouteAvailable: boolean;
  dnsReachable: boolean;
  capturedAt: string;
};

export type MobileClientPolicy = {
  autonomousMode: boolean;
};

export type MobileClientState = {
  platform: MobilePlatform;
  connection: MobileConnectionState;
  policy: MobileClientPolicy;
  revision: number;
};

export interface MobileDiagnosticsAdapter {
  snapshot(): Promise<MobileNetworkSnapshot>;
}

export type MobileClientEvent =
  | { type: 'snapshot'; state: MobileClientState; snapshot: MobileNetworkSnapshot }
  | { type: 'policy-changed'; state: MobileClientState }
  | { type: 'connection-changed'; state: MobileClientState };

export type MobileClientListener = (event: MobileClientEvent) => void;

const isMobilePlatform = (value: string): value is MobilePlatform => value === 'ios' || value === 'android';

const assertMobilePlatform = (platform: string): asserts platform is MobilePlatform => {
  if (!isMobilePlatform(platform)) {
    throw new Error(`Unsupported mobile platform: ${platform}`);
  }
};

export const createMobileClientState = (platform: string): MobileClientState => {
  assertMobilePlatform(platform);
  return {
    platform,
    connection: 'unknown',
    policy: { autonomousMode: false },
    revision: 0,
  };
};

export class MobileClientCore {
  private state: MobileClientState;
  private readonly listeners = new Set<MobileClientListener>();

  constructor(platform: string) {
    this.state = createMobileClientState(platform);
  }

  getState(): MobileClientState {
    return {
      ...this.state,
      policy: { ...this.state.policy },
    };
  }

  subscribe(listener: MobileClientListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setAutonomousMode(enabled: boolean): void {
    if (this.state.policy.autonomousMode === enabled) return;
    this.state = {
      ...this.state,
      policy: { autonomousMode: enabled },
      revision: this.state.revision + 1,
    };
    this.emit({ type: 'policy-changed', state: this.getState() });
  }

  async refresh(adapter: MobileDiagnosticsAdapter): Promise<MobileNetworkSnapshot> {
    const snapshot = await adapter.snapshot();
    assertMobilePlatform(snapshot.platform);
    if (snapshot.platform !== this.state.platform) {
      throw new Error(`Diagnostics platform mismatch: expected ${this.state.platform}, received ${snapshot.platform}`);
    }
    const previousConnection = this.state.connection;
    this.state = {
      ...this.state,
      connection: snapshot.connection,
      revision: this.state.revision + 1,
    };
    this.emit({ type: 'snapshot', state: this.getState(), snapshot });
    if (previousConnection !== snapshot.connection) {
      this.emit({ type: 'connection-changed', state: this.getState() });
    }
    return snapshot;
  }

  private emit(event: MobileClientEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
