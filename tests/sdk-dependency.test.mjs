import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression test for the 2026-08-29 live deployment incident: the
// governance repo's own package.json/lockfile pinned @modelcontextprotocol/sdk
// at 1.12.1, which does not ship a server/express.js subpath export. A
// separate, undocumented consumer (nyxa-claude-mcp-bridge.service) shares
// this repo's node_modules via a symlink and requires that exact export at
// runtime. Nothing in this repo's own test surface previously exercised
// that export, so the incompatibility shipped silently. This test pins the
// contract so it cannot silently regress again, independent of whether any
// particular consumer is currently deployed.

test("installed SDK version satisfies the minimum required by external stdio/HTTP consumers", () => {
  const pkg = JSON.parse(
    readFileSync(
      new URL("../node_modules/@modelcontextprotocol/sdk/package.json", import.meta.url)
    )
  );
  const [major, minor] = pkg.version.split(".").map(Number);
  const atLeast_1_30 = major > 1 || (major === 1 && minor >= 30);
  assert.ok(
    atLeast_1_30,
    `@modelcontextprotocol/sdk@${pkg.version} is older than 1.30.0; ` +
      "server/express.js is not guaranteed to exist below that version"
  );
});

test("@modelcontextprotocol/sdk/server/express.js resolves and exports createMcpExpressApp", async () => {
  const mod = await import("@modelcontextprotocol/sdk/server/express.js");
  assert.equal(typeof mod.createMcpExpressApp, "function");
});

test("core stdio server/client entry points used by this repo still resolve", async () => {
  await import("@modelcontextprotocol/sdk/server/mcp.js");
  await import("@modelcontextprotocol/sdk/server/stdio.js");
});
