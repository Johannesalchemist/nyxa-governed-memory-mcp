// Step 9 / Phase 9.2 regression: proves a spawned isolated E2E MCP server process
// actually receives an isolated HOME (read from the OS's own record of the child
// process's environment via /proc/<pid>/environ, not merely from our own JS intent),
// that HOME is never the production runtime repository or its data directory, and
// that no file appears under the production repository as a result of the run.
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createIsolatedE2EHome } from "./helpers/isolated-e2e-env.mjs";

const RUNTIME = resolve(".");

async function readChildEnviron(pid) {
  const raw = await readFile(`/proc/${pid}/environ`, "utf8");
  const env = {};
  for (const entry of raw.split("\0")) {
    if (!entry) continue;
    const idx = entry.indexOf("=");
    if (idx === -1) continue;
    env[entry.slice(0, idx)] = entry.slice(idx + 1);
  }
  return env;
}

async function snapshotRuntimeTree() {
  // Shallow snapshot of top-level entries is enough to detect any new file/dir
  // dropped into the production repo root as a side effect of a spawned process.
  return new Set(await readdir(RUNTIME));
}

test("isolated E2E home: spawned process env.HOME is the isolated dir, not the runtime repo", async (context) => {
  const home = await createIsolatedE2EHome();
  context.after(() => home.cleanup());

  assert.notEqual(home.homeDir, RUNTIME, "isolated home must never equal the production runtime path");
  assert.ok(home.homeDir.startsWith(tmpdir()), "isolated home must live under the OS temp root");

  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-isolated-home-data-"));
  const before = await snapshotRuntimeTree();

  const transport = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd: RUNTIME,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: home.homeDir,
      LANG: "C.UTF-8",
      NYXA_DATA_DIR: dataDir
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "nyxa-isolated-home-regression", version: "0.1.0" });
  await client.connect(transport);
  context.after(async () => client.close());

  const pid = transport.pid;
  assert.ok(Number.isInteger(pid), "transport must expose a real spawned pid");

  // Ground-truth check: ask the kernel what the child process's actual environment
  // is, rather than trusting our own intent to have set it correctly.
  const childEnv = await readChildEnviron(pid);
  assert.equal(childEnv.HOME, home.homeDir, "the OS's own record of the child process environment must show the isolated HOME");
  assert.notEqual(childEnv.HOME, RUNTIME, "the child process must never actually receive the production runtime path as HOME");

  // Exercise the server briefly so any HOME-dependent side effect (npm/git/pm2
  // config lookups, cache writes, etc.) would have a chance to occur.
  await client.callTool({ name: "nyxa_system_status", arguments: {} }).catch(() => {});

  const after = await snapshotRuntimeTree();
  const newEntries = [...after].filter((entry) => !before.has(entry));
  assert.deepEqual(newEntries, [], `no new files/dirs may appear under the production runtime root; found: ${newEntries.join(", ")}`);
});

test("isolated E2E home: cleanup removes the isolated home directory", async () => {
  const home = await createIsolatedE2EHome();
  await home.cleanup();
  await assert.rejects(stat(home.homeDir), /ENOENT/, "the isolated home directory must be gone after cleanup");
});
