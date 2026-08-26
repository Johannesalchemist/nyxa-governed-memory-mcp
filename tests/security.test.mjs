import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AuditLog } from "../dist/audit/AuditLog.js";
import { parseConnectorConfig } from "../dist/connector/config.js";
import { PathGuard, validateGitBase } from "../dist/connector/pathGuard.js";
import { RateLimiter } from "../dist/connector/rateLimiter.js";
import { redactText, sanitizeText } from "../dist/connector/redaction.js";
import { enforcePolicy } from "../dist/policy/enforcePolicy.js";

function config(root, access = "read") {
  return {
    enabled: true,
    devEnabled: true,
    gitExecutable: "/usr/bin/git",
    systemctlExecutable: "/usr/bin/systemctl",
    roots: [{ id: "root", path: root, access, trust: "VERIFIED_SOURCE" }],
    repositories: [],
    services: [],
    testTargets: [],
    limits: {
      maxOutputChars: 1000,
      maxFileBytes: 1000,
      maxSearchResults: 10,
      maxSearchFiles: 10,
      maxDirectoryEntries: 10,
      maxPatchBytes: 1000,
      toolTimeoutMs: 1000,
      rateLimitPerMinute: 2
    }
  };
}

test("path guard reads approved text and blocks traversal, secrets and symlink escape", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-root-"));
  const outside = await mkdtemp(join(tmpdir(), "nyxa-outside-"));
  await writeFile(join(root, "safe.txt"), "safe");
  await writeFile(join(root, ".env"), "TOKEN=bad");
  await writeFile(join(outside, "outside.txt"), "outside");
  await symlink(join(outside, "outside.txt"), join(root, "escape.txt"));
  const guard = new PathGuard(config(root));
  assert.equal((await guard.readTextFile("root:/safe.txt", 100)).text, "safe");
  await assert.rejects(() => guard.resolveExisting("root:/../outside.txt"), /path_traversal_denied/);
  await assert.rejects(() => guard.readTextFile("root:/.env", 100), /secret_path_denied/);
  await assert.rejects(() => guard.readTextFile("root:/escape.txt", 100), /symlink_escape_denied/);
});

test("development guard blocks production and connector control plane", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-dev-"));
  await mkdir(join(root, "src", "connector"), { recursive: true });
  await writeFile(join(root, "README.md"), "ok");
  await writeFile(join(root, "src", "connector", "config.ts"), "control");
  const readOnly = new PathGuard(config(root, "read"));
  await assert.rejects(() => readOnly.resolveDevTarget("root:/README.md"), /write_not_allowed/);
  const dev = new PathGuard(config(root, "dev"));
  await assert.rejects(() => dev.resolveDevTarget("root:/src/connector/config.ts"), /control_plane_write_denied/);
  assert.equal((await dev.resolveDevTarget("root:/README.md")).relativePath, "README.md");
});

test("git base validation rejects option and revision injection", () => {
  assert.equal(validateGitBase("main"), "main");
  assert.throws(() => validateGitBase("--output=/tmp/x"), /git_base_invalid/);
  assert.throws(() => validateGitBase("main..evil"), /git_base_invalid/);
});

test("redaction removes credentials before truncation", () => {
  const redacted = redactText("Authorization: Bearer abc.def.ghi token=supersecret");
  assert.ok(!redacted.text.includes("supersecret"));
  assert.ok(redacted.redactions >= 1);
  assert.equal(sanitizeText("x".repeat(50), 10).truncated, true);
});

test("rate limiter is deterministic", () => {
  const limiter = new RateLimiter(2, 1000);
  assert.equal(limiter.take(1000), true);
  assert.equal(limiter.take(1001), true);
  assert.equal(limiter.take(1002), false);
  assert.equal(limiter.take(2001), true);
});

test("unknown tools fail closed", () => {
  const decision = enforcePolicy("exec", "observe_only");
  assert.equal(decision.allowed, false);
  assert.equal(decision.outcome, "UNKNOWN");
});

test("audit hash chain detects tampering", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-audit-"));
  const audit = new AuditLog(dir);
  await audit.init();
  const base = {
    actor: "mcp",
    action: "tool.call",
    mode: "observe_only",
    backend: "local",
    result: "allowed"
  };
  await audit.append({ ...base, id: "1", timestamp: "2026-01-01T00:00:00.000Z" });
  await audit.append({ ...base, id: "2", timestamp: "2026-01-01T00:00:01.000Z" });
  assert.equal((await audit.verifyIntegrity()).valid, true);
  const file = join(dir, "audit.log.jsonl");
  const raw = await readFile(file, "utf8");
  await writeFile(file, raw.replace('"id":"1"', '"id":"x"'));
  assert.equal((await audit.verifyIntegrity()).valid, false);
});

test("configuration rejects unknown keys and arbitrary test executables", () => {
  const base = config("/tmp");
  assert.throws(() => parseConnectorConfig({ ...base, surprise: true }));
  assert.throws(() => parseConnectorConfig({
    ...base,
    testTargets: [{
      id: "bad",
      executable: "/bin/bash",
      args: [],
      cwd: "/tmp",
      timeoutMs: 1000,
      trust: "VERIFIED_SOURCE",
      integrityFiles: []
    }]
  }), /test_executable_not_allowed/);
});
