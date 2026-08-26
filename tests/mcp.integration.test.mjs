import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function parseResult(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  assert.equal(typeof text, "string");
  return JSON.parse(text);
}

test("real MCP stdio surface is typed, scoped and fail-closed", async (context) => {
  const cwd = resolve(".");
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-mcp-integration-"));
  const transport = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: cwd,
      LANG: "C.UTF-8",
      NYXA_AGENT_MODE: "draft",
      NYXA_DRAFTS_ENABLED: "true",
      NYXA_DATA_DIR: dataDir,
      NYXA_CONNECTOR_CONFIG: join(cwd, "config", "connector.dev.example.json")
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "nyxa-mcp-integration", version: "0.1.0" });
  context.after(async () => {
    await client.close();
  });
  await client.connect(transport);

  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  for (const expected of [
    "nyxa_system_status", "nyxa_list", "nyxa_read_file", "nyxa_search",
    "nyxa_git_status", "nyxa_git_diff", "nyxa_logs", "nyxa_run_test", "nyxa_apply_patch"
  ]) assert.ok(names.includes(expected), `missing ${expected}`);
  for (const forbidden of ["exec", "execute", "shell", "bash", "run_command", "ssh_exec"]) {
    assert.ok(!names.includes(forbidden), `forbidden tool exposed: ${forbidden}`);
  }

  const status = parseResult(await client.callTool({ name: "nyxa_system_status", arguments: {} }));
  assert.equal(status.policy_decision, "ALLOWED");
  assert.equal(status.data.containers, "not_available_without_privileged_docker_socket");

  const listing = parseResult(await client.callTool({
    name: "nyxa_list",
    arguments: { path: "governed-original:/src" }
  }));
  assert.equal(listing.policy_decision, "ALLOWED");
  assert.ok(listing.data.entries.some((entry) => entry.name === "server.ts"));

  const malformed = parseResult(await client.callTool({
    name: "nyxa_list",
    arguments: { path: "governed-original:/src", unexpected: true }
  }));
  assert.equal(malformed.policy_decision, "INVALID");
  assert.equal(malformed.error.code, "arguments_invalid");

  const read = parseResult(await client.callTool({
    name: "nyxa_read_file",
    arguments: { path: "governed-original:/README.md", start_line: 1, end_line: 5 }
  }));
  assert.equal(read.policy_decision, "ALLOWED");

  const search = parseResult(await client.callTool({
    name: "nyxa_search",
    arguments: { query: "Governance", path: "governed-original:/README.md", max_results: 5 }
  }));
  assert.equal(search.policy_decision, "ALLOWED");
  assert.ok(search.data.matches.length > 0);

  const deniedSecret = parseResult(await client.callTool({
    name: "nyxa_read_file",
    arguments: { path: "governed-original:/.env", start_line: 1, end_line: 2 }
  }));
  assert.equal(deniedSecret.policy_decision, "DENIED");
  assert.equal(deniedSecret.error.code, "secret_path_denied");

  const git = parseResult(await client.callTool({
    name: "nyxa_git_status",
    arguments: { repository: "governed-original" }
  }));
  assert.equal(git.policy_decision, "ALLOWED");

  const diff = parseResult(await client.callTool({
    name: "nyxa_git_diff",
    arguments: { repository: "governed-original", base: "HEAD" }
  }));
  assert.equal(diff.policy_decision, "ALLOWED");

  const deniedLog = parseResult(await client.callTool({
    name: "nyxa_logs",
    arguments: { service: "n8n", lines: 200 }
  }));
  assert.equal(deniedLog.policy_decision, "UNKNOWN");

  const testRun = parseResult(await client.callTool({
    name: "nyxa_run_test",
    arguments: { target: "drift-audit" }
  }));
  assert.equal(testRun.policy_decision, "ALLOWED");
  assert.equal(testRun.evidence.trust, "UNVERIFIED_SOURCE");

  const deniedPatch = parseResult(await client.callTool({
    name: "nyxa_apply_patch",
    arguments: { path: "governed-dev:/src/connector/config.ts", patch: "invalid" }
  }));
  assert.equal(deniedPatch.policy_decision, "DENIED");
  assert.equal(deniedPatch.error.code, "control_plane_write_denied");

  await assert.rejects(() => client.callTool({ name: "exec", arguments: {} }));
  const audit = parseResult(await client.callTool({
    name: "audit.trace",
    arguments: { limit: 20 }
  }));
  assert.equal(audit.integrity.valid, true);
  assert.ok(audit.events.some((event) =>
    event.tool === "exec" && event.policy_decision === "UNKNOWN" && event.result === "blocked"
  ));
});
