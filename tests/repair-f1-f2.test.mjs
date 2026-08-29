import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { evaluateProposal } from "../dist/governance/gamma.js";
import { parseProposal } from "../dist/governance/proposal.js";
import { TOOL_POLICIES } from "../dist/policy/toolPolicy.js";

const NOW = Date.parse("2026-08-29T12:00:00.000Z");

function baseProposal(overrides = {}) {
  return {
    actor: "test-actor",
    action: "nyxa_read_file",
    target: "root:/README.md",
    scope: "F2 regression",
    claims: [{ tag: "FACT", statement: "file exists", source: "filesystem-listing" }],
    uncertainty: 0.1,
    requestedCapabilityClass: "I0",
    estimatedIrreversibility: "I0",
    provenance: { taskId: "t1", runId: "r1", requestingIdentity: "tester" },
    ...overrides
  };
}

function decisionFor(target) {
  const proposal = parseProposal(baseProposal({ target }));
  return evaluateProposal(proposal, { toolPolicy: TOOL_POLICIES["nyxa_read_file"], mode: "observe_only", now: NOW });
}

// --- F2: gamma protected-target canonicalization ---

test("F2: canonical protected target is denied at C1", () => {
  const d = decisionFor("dev:/src/governance/gamma.ts");
  assert.equal(d.outcome, "DENY");
  assert.equal(d.domain, "C1");
});

test("F2: '../' traversal-obfuscated equivalent is denied identically (was the confirmed bypass)", () => {
  const d = decisionFor("dev:/src/notgovernance/../governance/gamma.ts");
  assert.equal(d.outcome, "DENY");
  assert.equal(d.domain, "C1");
});

test("F2: repeated-separator obfuscation is denied identically", () => {
  const d = decisionFor("dev:/src//governance//gamma.ts");
  assert.equal(d.outcome, "DENY");
  assert.equal(d.domain, "C1");
});

test("F2: './'-prefixed equivalent is denied identically", () => {
  const d = decisionFor("dev:/./src/governance/gamma.ts");
  assert.equal(d.outcome, "DENY");
  assert.equal(d.domain, "C1");
});

test("F2: harmless similarly-named sibling path is NOT falsely protected", () => {
  const d = decisionFor("dev:/src/governance-notes/README.md");
  assert.notEqual(d.domain, "C1");
});

test("F2: genuinely non-protected path is NOT denied", () => {
  const d = decisionFor("dev:/README.md");
  assert.notEqual(d.outcome, "DENY");
});

test("F2: deeper traversal that would otherwise escape entirely is still caught (fails closed, not falls through)", () => {
  const d = decisionFor("dev:/../../etc/passwd");
  // splitVirtualPath rejects ".." outright -> isProtectedTarget treats unparseable targets as
  // protected/denied rather than silently returning "not protected".
  assert.equal(d.outcome, "DENY");
  assert.equal(d.domain, "C1");
});

// --- F1: shared rate limiting between direct and proposal-routed execution ---

test("F1: direct and proposal-routed connector execution share one rate-limit pool", async (context) => {
  const cwd = resolve(".");
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-f1-data-"));
  const configDir = await mkdtemp(join(tmpdir(), "nyxa-f1-config-"));
  const LIMIT = 4;
  const config = {
    enabled: true,
    devEnabled: false,
    gitExecutable: "/usr/bin/git",
    systemctlExecutable: "/usr/bin/systemctl",
    roots: [{ id: "readroot", path: cwd, access: "read", trust: "VERIFIED_SOURCE" }],
    repositories: [],
    services: [],
    testTargets: [],
    limits: {
      maxOutputChars: 50000,
      maxFileBytes: 1048576,
      maxSearchResults: 100,
      maxSearchFiles: 5000,
      maxDirectoryEntries: 1000,
      maxPatchBytes: 200000,
      toolTimeoutMs: 30000,
      rateLimitPerMinute: LIMIT
    }
  };
  const configPath = join(configDir, "connector.json");
  await writeFile(configPath, JSON.stringify(config), "utf8");

  const transport = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: cwd,
      LANG: "C.UTF-8",
      NYXA_AGENT_MODE: "observe_only",
      NYXA_DATA_DIR: dataDir,
      NYXA_CONNECTOR_CONFIG: configPath
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "nyxa-f1-regression", version: "0.1.0" });
  context.after(async () => {
    await client.close();
  });
  await client.connect(transport);

  function parse(result) {
    const text = result.content?.find((item) => item.type === "text")?.text;
    return JSON.parse(text);
  }

  // Consume LIMIT - 1 units via the DIRECT path, leaving exactly one unit of quota.
  for (let i = 0; i < LIMIT - 1; i++) {
    const r = parse(await client.callTool({ name: "nyxa_list", arguments: { path: "readroot:/" } }));
    assert.notEqual(r.error?.code, "rate_limited", `direct call ${i} should not be rate-limited yet`);
  }

  // The single remaining unit is consumed via the PROPOSAL-ROUTED path -- if F1 is fixed, this
  // succeeds (ALLOW, quota was shared and this was the last unit) and the pool is now empty.
  const proposalCall = () => client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: {
        actor: "f1-regression", action: "nyxa_list", target: "readroot:/",
        scope: "consume the last shared rate-limit unit via the proposal path",
        claims: [{ tag: "FACT", statement: "probe", source: "f1-regression" }],
        uncertainty: 0.1, requestedCapabilityClass: "I0", estimatedIrreversibility: "I0",
        provenance: { taskId: "f1", runId: "last-unit", requestingIdentity: "tester" }
      }
    }
  });
  const lastUnit = parse(await proposalCall());
  assert.equal(lastUnit.policy_decision, "ALLOW", "the shared pool must have exactly one unit left for the proposal path to consume");

  // Now the pool is empty (LIMIT units consumed across BOTH paths combined). The next
  // proposal-routed call must be rate-limited -- this is the confirmed-fixed behavior: before
  // the repair this call always succeeded regardless of how many direct calls preceded it.
  const overLimit = parse(await proposalCall());
  assert.equal(overLimit.policy_decision, "DENIED");
  assert.equal(overLimit.error.code, "rate_limited");
  assert.equal(overLimit.error.message, "Rate limit exceeded.");

  // A direct call also correctly still sees the pool as empty (proves no double-counting created
  // a separate allowance for either path, and confirms connector_disabled semantics are
  // untouched -- this call fails with rate_limited, not with a connector-disabled error, showing
  // the connector itself is genuinely enabled/reachable for this test).
  const directOverLimit = parse(await client.callTool({ name: "nyxa_list", arguments: { path: "readroot:/" } }));
  assert.equal(directOverLimit.error?.code, "rate_limited");
});

test("F1: a DENIED proposal (never reaching execution) does not consume the shared rate-limit quota", async (context) => {
  const cwd = resolve(".");
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-f1b-data-"));
  const configDir = await mkdtemp(join(tmpdir(), "nyxa-f1b-config-"));
  const LIMIT = 2;
  const config = {
    enabled: true, devEnabled: false,
    gitExecutable: "/usr/bin/git", systemctlExecutable: "/usr/bin/systemctl",
    roots: [{ id: "readroot", path: cwd, access: "read", trust: "VERIFIED_SOURCE" }],
    repositories: [], services: [], testTargets: [],
    limits: {
      maxOutputChars: 50000, maxFileBytes: 1048576, maxSearchResults: 100, maxSearchFiles: 5000,
      maxDirectoryEntries: 1000, maxPatchBytes: 200000, toolTimeoutMs: 30000, rateLimitPerMinute: LIMIT
    }
  };
  const configPath = join(configDir, "connector.json");
  await writeFile(configPath, JSON.stringify(config), "utf8");

  const transport = new StdioClientTransport({
    command: "/usr/bin/node", args: ["dist/index.js"], cwd,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: cwd, LANG: "C.UTF-8", NYXA_AGENT_MODE: "observe_only",
      NYXA_DATA_DIR: dataDir, NYXA_CONNECTOR_CONFIG: configPath
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "nyxa-f1b-regression", version: "0.1.0" });
  context.after(async () => { await client.close(); });
  await client.connect(transport);

  function parse(result) {
    const text = result.content?.find((item) => item.type === "text")?.text;
    return JSON.parse(text);
  }

  // Submit a proposal gamma will DENY (unknown tool -> UNKNOWN, never reaches execution) many
  // times -- more than LIMIT -- and confirm the shared pool is untouched by any of them.
  for (let i = 0; i < LIMIT + 3; i++) {
    const r = parse(await client.callTool({
      name: "nyxa_propose_action",
      arguments: {
        proposal: {
          actor: "f1b-regression", action: "nyxa_delete_everything", target: "readroot:/",
          scope: "denied proposal must not consume execution quota",
          claims: [{ tag: "FACT", statement: "probe", source: "f1b-regression" }],
          uncertainty: 0.1, requestedCapabilityClass: "I0", estimatedIrreversibility: "I0",
          provenance: { taskId: "f1b", runId: `deny-${i}`, requestingIdentity: "tester" }
        }
      }
    }));
    assert.equal(r.policy_decision, "UNKNOWN");
  }

  // Full quota must still be available for a real, ALLOWed execution.
  for (let i = 0; i < LIMIT; i++) {
    const r = parse(await client.callTool({ name: "nyxa_list", arguments: { path: "readroot:/" } }));
    assert.notEqual(r.error?.code, "rate_limited", `direct call ${i} should still have quota after ${LIMIT + 3} denied proposals`);
  }
});
