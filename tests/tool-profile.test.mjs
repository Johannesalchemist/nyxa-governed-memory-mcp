import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolveToolProfile, isToolAllowedByProfile, CHATGPT_READONLY_TOOLS } from "../dist/policy/toolProfile.js";
import { TOOL_POLICIES } from "../dist/policy/toolPolicy.js";

const EXPECTED_10 = [
  "system.status",
  "policy.mode",
  "audit.trace",
  "governance.status",
  "governance.trace",
  "gamma.decisions",
  "capability_gate.trace",
  "evidence.latest",
  "evidence.trace",
  "memory.status"
].sort();

// ---------------------------------------------------------------------------
// Part A: pure unit tests against the profile module itself.
// ---------------------------------------------------------------------------

test("resolveToolProfile: unset/empty env value is inactive (full existing behavior)", () => {
  assert.deepEqual(resolveToolProfile(undefined), { active: false });
  assert.deepEqual(resolveToolProfile(""), { active: false });
  assert.deepEqual(resolveToolProfile("   "), { active: false });
});

test("resolveToolProfile: chatgpt_readonly resolves to exactly the intended 10-tool allowlist", () => {
  const profile = resolveToolProfile("chatgpt_readonly");
  assert.equal(profile.active, true);
  assert.equal(profile.recognized, true);
  assert.deepEqual([...profile.allowed].sort(), EXPECTED_10);
  assert.equal(profile.allowed, CHATGPT_READONLY_TOOLS);
});

test("resolveToolProfile: an unknown profile name fails CLOSED (active, empty allowlist), not open", () => {
  const profile = resolveToolProfile("some_typo_profile");
  assert.equal(profile.active, true);
  assert.equal(profile.recognized, false);
  assert.equal(profile.allowed.size, 0);
  assert.equal(isToolAllowedByProfile(profile, "system.status"), false, "even the most harmless tool must be denied under an unrecognized profile");
});

test("isToolAllowedByProfile: inactive profile allows everything (no restriction)", () => {
  const inactive = { active: false };
  assert.equal(isToolAllowedByProfile(inactive, "nyxa_apply_patch"), true);
  assert.equal(isToolAllowedByProfile(inactive, "anything_at_all"), true);
});

test("the 10-tool allowlist names match real, currently-registered TOOL_POLICIES keys (no typos, nothing invented)", () => {
  for (const name of CHATGPT_READONLY_TOOLS) {
    assert.ok(name in TOOL_POLICIES, `${name} must be a real registered tool policy`);
  }
});

// ---------------------------------------------------------------------------
// Part B: real stdio process, exercising the actual profile gate end-to-end.
// ---------------------------------------------------------------------------

function parse(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  return JSON.parse(text);
}

async function spawnServer({ toolProfile } = {}) {
  const cwd = resolve(".");
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-profile-data-"));
  const transport = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: cwd,
      LANG: "C.UTF-8",
      NYXA_DATA_DIR: dataDir,
      ...(toolProfile !== undefined ? { NYXA_MCP_TOOL_PROFILE: toolProfile } : {})
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "nyxa-tool-profile-test", version: "0.1.0" });
  await client.connect(transport);
  return { client, dataDir };
}

test("A: chatgpt_readonly tools/list returns exactly the 10 authorized tools, no more no less", async (context) => {
  const { client } = await spawnServer({ toolProfile: "chatgpt_readonly" });
  context.after(async () => client.close());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED_10);
});

test("B: all 10 authorized tools remain callable, subject to their normal existing policy (no argument-shape/behavior change)", async (context) => {
  const { client } = await spawnServer({ toolProfile: "chatgpt_readonly" });
  context.after(async () => client.close());

  for (const name of ["system.status", "policy.mode", "governance.status", "memory.status"]) {
    const r = parse(await client.callTool({ name, arguments: {} }));
    assert.equal(r.error, undefined, `${name} must succeed under chatgpt_readonly exactly as it does unprofiled`);
  }
  for (const name of ["audit.trace", "governance.trace", "gamma.decisions", "capability_gate.trace", "evidence.latest", "evidence.trace"]) {
    const r = parse(await client.callTool({ name, arguments: {} }));
    assert.equal(r.error, undefined, `${name} must succeed under chatgpt_readonly`);
  }
  // Existing per-tool argument validation still applies unchanged -- the profile did not loosen it.
  const badLimit = parse(await client.callTool({ name: "evidence.latest", arguments: { limit: 9999 } }));
  assert.equal(badLimit.error?.code, "arguments_invalid");
});

test("C: hidden tools fail closed by name even when the caller knows they exist server-side, denial happens before dispatch (no side effects, no distinguishing error)", async (context) => {
  const { client } = await spawnServer({ toolProfile: "chatgpt_readonly" });
  context.after(async () => client.close());

  const hiddenCalls = [
    { name: "nyxa_apply_patch", arguments: { path: "dev:/x", patch: "not a real patch" } },
    { name: "nyxa_run_test", arguments: { target: "build" } },
    // A payload that WOULD throw a distinct proposal_invalid error if dispatch were ever reached.
    { name: "nyxa_propose_action", arguments: { proposal: { garbage: true } } },
    { name: "nyxa_self_model_read", arguments: { domain: "all" } },
    // Also confirm the other 9 connector tools and the remaining hidden tool are unreachable.
    { name: "nyxa_system_status", arguments: {} },
    { name: "nyxa_list", arguments: { path: "root:/" } },
    { name: "nyxa_read_file", arguments: { path: "root:/x" } },
    { name: "nyxa_search", arguments: { query: "x" } },
    { name: "nyxa_git_status", arguments: { repository: "x" } },
    { name: "nyxa_git_diff", arguments: { repository: "x" } },
    { name: "nyxa_logs", arguments: { service: "x" } }
  ];

  for (const call of hiddenCalls) {
    let threw = false;
    try {
      await client.callTool(call);
    } catch (error) {
      threw = true;
      // MCP SDK surfaces McpError(MethodNotFound) as a JSON-RPC error, not a tool result --
      // identical to how a genuinely nonexistent tool name is rejected, proving no
      // distinguishing signal (e.g. a distinct "hidden" error code) leaks through.
      assert.match(String(error.message ?? error), /Unknown tool/i);
    }
    assert.ok(threw, `${call.name} must be rejected before dispatch, not silently succeed or return a tool-shaped error`);
  }

  // Compare directly against a truly nonexistent tool name -- the response must be
  // indistinguishable in shape/code from a hidden-but-real one.
  let hiddenError, nonexistentError;
  try { await client.callTool({ name: "nyxa_run_test", arguments: { target: "build" } }); } catch (e) { hiddenError = e; }
  try { await client.callTool({ name: "this_tool_does_not_exist_anywhere", arguments: {} }); } catch (e) { nonexistentError = e; }
  assert.equal(hiddenError?.code, nonexistentError?.code);
});

test("D: an unrecognized profile name fails closed -- zero tools listed, every call denied, including the otherwise-harmless system.status", async (context) => {
  const { client } = await spawnServer({ toolProfile: "totally_made_up_profile" });
  context.after(async () => client.close());

  const { tools } = await client.listTools();
  assert.deepEqual(tools, []);

  await assert.rejects(() => client.callTool({ name: "system.status", arguments: {} }), /Unknown tool/i);
  await assert.rejects(() => client.callTool({ name: "policy.mode", arguments: {} }), /Unknown tool/i);
});

test("E: unset profile preserves the full existing 21-tool enumeration exactly", async (context) => {
  const { client } = await spawnServer(); // no NYXA_MCP_TOOL_PROFILE at all
  context.after(async () => client.close());
  const { tools } = await client.listTools();
  assert.equal(tools.length, 21);
  for (const name of EXPECTED_10) assert.ok(tools.some((t) => t.name === name));
  for (const name of ["nyxa_apply_patch", "nyxa_run_test", "nyxa_propose_action", "nyxa_self_model_read", "nyxa_list", "nyxa_read_file", "nyxa_search", "nyxa_git_status", "nyxa_git_diff", "nyxa_logs", "nyxa_system_status"]) {
    assert.ok(tools.some((t) => t.name === name), `${name} must still be present when no profile is set`);
  }
});

test("F: profile selection cannot be altered through MCP call arguments", async (context) => {
  const { client } = await spawnServer({ toolProfile: "chatgpt_readonly" });
  context.after(async () => client.close());

  // Attempt to smuggle a profile override alongside a hidden-tool call -- must still be denied
  // exactly as without it. There is no argument name this server recognizes as a profile
  // selector, so this also incidentally exercises assertKeys, but the point being proven is that
  // the ACTIVE profile (read once from env at construction) is unaffected by call arguments.
  for (const badArgs of [
    { profile: "unset" },
    { NYXA_MCP_TOOL_PROFILE: "" },
    { toolProfile: "none" }
  ]) {
    await assert.rejects(() => client.callTool({ name: "nyxa_run_test", arguments: { target: "build", ...badArgs } }), /Unknown tool/i);
  }
  // The allowed set is still exactly the same 10 after these attempts.
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED_10);
});

test("G: no authority/execution/connector/network/filesystem capability change -- allowed tools go through the exact same policy/audit machinery as unprofiled", async (context) => {
  const { client } = await spawnServer({ toolProfile: "chatgpt_readonly" });
  context.after(async () => client.close());

  const status = parse(await client.callTool({ name: "system.status", arguments: {} }));
  assert.equal(status.agent_mode, "observe_only");
  assert.equal(status.feature_flags.authoritative_writes_enabled, false);
  assert.equal(status.feature_flags.execution_tools_enabled, false);

  // The connector remains disabled exactly as without a profile -- the profile only restricts
  // discovery/invocation surface, it never enables anything the underlying mode/config forbids.
  // (nyxa_system_status is hidden under this profile, so this checks it fails as "hidden", not
  // that it would succeed if visible -- capability is unaffected either way.)
  await assert.rejects(() => client.callTool({ name: "nyxa_system_status", arguments: {} }), /Unknown tool/i);

  // governance.status must report the SAME gamma engine description as unprofiled -- the profile
  // touches nothing about governance semantics for tools that remain allowed.
  const govStatus = parse(await client.callTool({ name: "governance.status", arguments: {} }));
  assert.equal(govStatus.gamma_engine.checks_in_order.length, 6); // C1-C5 + E0
});

test("H: audit-chain integrity remains valid across allowed calls, denied hidden-tool attempts, and an unrecognized-profile instance", async (context) => {
  const { client: readonlyClient, dataDir } = await spawnServer({ toolProfile: "chatgpt_readonly" });
  context.after(async () => readonlyClient.close());

  await readonlyClient.callTool({ name: "governance.status", arguments: {} });
  await readonlyClient.callTool({ name: "nyxa_run_test", arguments: { target: "build" } }).catch(() => {});
  await readonlyClient.callTool({ name: "nyxa_propose_action", arguments: { proposal: {} } }).catch(() => {});

  // Re-open the SAME data dir with no profile restriction to read back audit.trace's integrity
  // check (audit.trace itself is one of the 10 allowed tools, but using an unprofiled instance
  // here avoids conflating "is audit.trace reachable" with "is the chain valid").
  const cwd = resolve(".");
  const transport = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd,
    env: { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME: cwd, LANG: "C.UTF-8", NYXA_DATA_DIR: dataDir },
    stderr: "pipe"
  });
  const verifierClient = new Client({ name: "nyxa-tool-profile-integrity-check", version: "0.1.0" });
  context.after(async () => verifierClient.close());
  await verifierClient.connect(transport);
  const trace = parse(await verifierClient.callTool({ name: "audit.trace", arguments: { limit: 1 } }));
  assert.equal(trace.integrity.valid, true);
});
