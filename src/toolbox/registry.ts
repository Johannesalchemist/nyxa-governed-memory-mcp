export type Risk = "read" | "effect";
export type ConnectorState = "ready" | "offline" | "not_configured" | "degraded";

export type Capability = {
  name: string;
  description: string;
  risk: Risk;
  inputSchema: Record<string, unknown>;
  version?: string;
  connector?: string;
  resourceKind?: string;
  requires?: readonly string[];
  evidence?: boolean;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

export type ConnectorDescriptor = {
  id: string;
  kind: string;
  state: ConnectorState;
  description: string;
};

export class ToolboxRegistry {
  private m = new Map<string, Capability>();
  private connectors = new Map<string, ConnectorDescriptor>();

  register(c: Capability) {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(c.name)) throw Error("invalid_capability_name");
    if (this.m.has(c.name)) throw Error("duplicate_capability");
    this.m.set(c.name, c);
  }

  registerConnector(c: ConnectorDescriptor) {
    if (!/^[a-z][a-z0-9_-]*$/.test(c.id)) throw Error("invalid_connector_id");
    if (this.connectors.has(c.id)) throw Error("duplicate_connector");
    this.connectors.set(c.id, Object.freeze({ ...c }));
  }

  list() {
    return [...this.m.values()].map(({ handler, ...x }) => x);
  }

  describe(n: string) {
    const c = this.m.get(n);
    if (!c) return null;
    const { handler, ...x } = c;
    return x;
  }

  health() {
    return {
      status: "ready",
      capability_count: this.m.size,
      connectors: [...this.connectors.values()]
    };
  }

  async execute(n: string, i: Record<string, unknown>) {
    const c = this.m.get(n);
    if (!c) throw Error("capability_not_found");
    return c.handler(i);
  }
}

export const toolbox = new ToolboxRegistry();

const unavailable = (connector: string) => async () => ({
  status: "not_configured",
  connector,
  executable: false
});

toolbox.registerConnector({ id: "media", kind: "provider", state: "ready", description: "Governed media provider gateway." });
toolbox.registerConnector({ id: "sascha-mac", kind: "remote_runner", state: "not_configured", description: "Outbound authenticated macOS/Xcode runner." });
toolbox.registerConnector({ id: "apple-store", kind: "api", state: "not_configured", description: "App Store Connect adapter; credentials remain outside MCP results." });
toolbox.registerConnector({ id: "n8n-central", kind: "workflow", state: "not_configured", description: "Authoritative central n8n orchestration adapter." });
toolbox.registerConnector({ id: "n8n-sascha", kind: "workflow", state: "not_configured", description: "Sascha local n8n adapter for governed reconciliation." });

toolbox.register({
  name: "media.capabilities",
  description: "Lists governed media capabilities without exposing credentials.",
  risk: "read",
  version: "1.0.0",
  connector: "media",
  inputSchema: { type: "object", additionalProperties: false },
  handler: async () => ({ gateway: "NYXA Governed Media Gateway V1", providers: ["openrouter"], operations: ["capabilities"], publication: "human_approval_required" })
});

for (const c of [
  ["macos.runner.status", "Returns enrolled macOS runner status.", "sascha-mac", "runner"],
  ["macos.runner.capabilities", "Returns declared macOS runner capabilities.", "sascha-mac", "runner"],
  ["xcode.environment.inspect", "Inspects Xcode, SDK and simulator environment.", "sascha-mac", "runner"],
  ["xcode.simulator.list", "Lists available iOS simulator runtimes and devices.", "sascha-mac", "runner"],
  ["apple.account.status", "Checks App Store Connect adapter status without exposing credentials.", "apple-store", "apple_account"],
  ["apple.apps.list", "Lists applications visible to the configured App Store Connect identity.", "apple-store", "apple_account"],
  ["n8n.central.status", "Returns central n8n connector health.", "n8n-central", "workflow_engine"],
  ["n8n.local.status", "Returns Sascha local n8n connector health.", "n8n-sascha", "workflow_engine"],
  ["n8n.workflow.sync.status", "Returns reconciliation state without modifying either n8n instance.", "n8n-central", "workflow"]
] as const) {
  toolbox.register({
    name: c[0], description: c[1], risk: "read", version: "1.0.0", connector: c[2],
    resourceKind: c[3], evidence: true,
    inputSchema: { type: "object", additionalProperties: false },
    handler: unavailable(c[2])
  });
}

for (const c of [
  ["xcode.dependencies.resolve", "Resolves project dependencies on the enrolled Mac.", "sascha-mac", "xcode_project"],
  ["xcode.build", "Builds a validated Xcode target without arbitrary command execution.", "sascha-mac", "xcode_project"],
  ["xcode.test", "Runs an approved Xcode test plan.", "sascha-mac", "xcode_project"],
  ["xcode.archive", "Creates an Xcode archive for an approved project.", "sascha-mac", "xcode_project"],
  ["xcode.simulator.boot", "Boots an approved simulator device.", "sascha-mac", "simulator"],
  ["xcode.simulator.install", "Installs an approved build into a simulator.", "sascha-mac", "simulator"],
  ["xcode.simulator.launch", "Launches an approved application in a simulator.", "sascha-mac", "simulator"],
  ["apple.build.upload", "Uploads an approved signed build to App Store Connect.", "apple-store", "apple_app"],
  ["apple.metadata.update", "Updates approved App Store metadata after governed diff.", "apple-store", "apple_app"],
  ["apple.testflight.distribute", "Distributes an approved processed build through TestFlight.", "apple-store", "apple_app"],
  ["apple.review.submit", "Submits an approved version for App Review.", "apple-store", "apple_app"],
  ["apple.release.configure", "Configures an approved production release.", "apple-store", "apple_app"],
  ["n8n.workflow.execute", "Executes an approved central n8n workflow.", "n8n-central", "workflow"],
  ["n8n.workflow.sync.apply", "Applies an approved non-conflicting workflow reconciliation plan.", "n8n-central", "workflow"]
] as const) {
  toolbox.register({
    name: c[0], description: c[1], risk: "effect", version: "1.0.0", connector: c[2],
    resourceKind: c[3], evidence: true,
    inputSchema: { type: "object" },
    handler: unavailable(c[2])
  });
}
