import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SecureConnector } from "../dist/connector/SecureConnector.js";
import { PathGuard } from "../dist/connector/pathGuard.js";
import { runFixedProcess } from "../dist/connector/processRunner.js";
import { enforcePolicy } from "../dist/policy/enforcePolicy.js";

function connectorConfig(root) {
  return {
    enabled: true,
    devEnabled: true,
    gitExecutable: "/usr/bin/git",
    systemctlExecutable: "/usr/bin/systemctl",
    roots: [{ id: "dev", path: root, access: "dev", trust: "VERIFIED_SOURCE" }],
    repositories: [{ id: "dev", path: root, rootId: "dev" }],
    services: [],
    testTargets: [],
    limits: {
      maxOutputChars: 1000,
      maxFileBytes: 1000,
      maxSearchResults: 10,
      maxSearchFiles: 10,
      maxDirectoryEntries: 10,
      maxPatchBytes: 1000,
      toolTimeoutMs: 500,
      rateLimitPerMinute: 10
    }
  };
}

test("forbidden shell-equivalent tool names are unreachable", () => {
  for (const name of ["exec", "execute", "shell", "bash", "run_command", "ssh_exec"]) {
    const decision = enforcePolicy(name, "draft");
    assert.equal(decision.allowed, false);
    assert.equal(decision.outcome, "UNKNOWN");
  }
});

test("absolute, traversal, secret and symlink attacks fail", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-adv-root-"));
  const outside = await mkdtemp(join(tmpdir(), "nyxa-adv-out-"));
  await writeFile(join(outside, "secret.txt"), "secret");
  await writeFile(join(root, "credential.pem"), "secret");
  await symlink(outside, join(root, "jump"), "dir");
  const guard = new PathGuard(connectorConfig(root));
  await assert.rejects(() => guard.resolveExisting("/etc/passwd"));
  await assert.rejects(() => guard.resolveExisting("dev:/../../etc/passwd"));
  await assert.rejects(() => guard.resolveExisting("dev:/credential.pem"));
  await assert.rejects(() => guard.resolveExisting("dev:/jump/secret.txt"));
});

test("shell metacharacters remain literal process arguments", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-shell-"));
  const marker = join(dir, "owned");
  const payload = `$(touch ${marker});echo hacked`;
  const result = await runFixedProcess({
    executable: "/usr/bin/printf",
    args: ["%s", payload],
    cwd: dir,
    timeoutMs: 1000,
    maxOutputChars: 1000
  });
  assert.equal(result.stdout, payload);
  await assert.rejects(() => access(marker));
});

test("timeouts terminate fixed processes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-timeout-"));
  const result = await runFixedProcess({
    executable: "/usr/bin/node",
    args: ["-e", "setTimeout(() => {}, 10000)"],
    cwd: dir,
    timeoutMs: 100,
    maxOutputChars: 1000
  });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.exitCode, 0);
});

test("unknown logs and production writes fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-connector-"));
  await mkdir(join(root, "src", "connector"), { recursive: true });
  await writeFile(join(root, "README.md"), "safe");
  const connector = new SecureConnector(connectorConfig(root), join(root, "audit"));
  await assert.rejects(() => connector.logs("n8n", 200), /log_source_not_allowed/);
  const readConfig = connectorConfig(root);
  readConfig.roots[0].access = "read";
  const readConnector = new SecureConnector(readConfig, join(root, "audit2"));
  await assert.rejects(() => readConnector.applyPatch("dev:/README.md", "bad"), /write_not_allowed/);
});

test("multi-file, oversized and control-plane patches are denied before execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-patch-"));
  await mkdir(join(root, ".git"));
  await mkdir(join(root, "src", "connector"), { recursive: true });
  await writeFile(join(root, "README.md"), "safe\n");
  await writeFile(join(root, "OTHER.md"), "safe\n");
  await writeFile(join(root, "src", "connector", "config.ts"), "control\n");
  const connector = new SecureConnector(connectorConfig(root), join(root, "audit"));
  const multi = [
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -1 +1 @@",
    "-safe",
    "+changed",
    "diff --git a/OTHER.md b/OTHER.md",
    "--- a/OTHER.md",
    "+++ b/OTHER.md",
    "@@ -1 +1 @@",
    "-safe",
    "+changed"
  ].join("\n");
  await assert.rejects(() => connector.applyPatch("dev:/README.md", multi), /patch_scope_invalid/);
  await assert.rejects(() => connector.applyPatch("dev:/README.md", "x".repeat(1001)), /patch_invalid/);
  await assert.rejects(() => connector.applyPatch("dev:/src/connector/config.ts", "x"), /control_plane_write_denied/);
});

test("binary files never reach the model", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-binary-"));
  await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  const connector = new SecureConnector(connectorConfig(root), join(root, "audit"));
  await assert.rejects(() => connector.readFile("dev:/binary.bin"), /binary_file_denied/);
});

async function initializeRepository(root) {
  for (const args of [
    ["init", "-b", "main"],
    ["config", "user.name", "NYXA Test"],
    ["config", "user.email", "nyxa-test@example.invalid"],
    ["add", "README.md", "verify.mjs"],
    ["commit", "-m", "fixture"]
  ]) {
    const result = await runFixedProcess({
      executable: "/usr/bin/git",
      args,
      cwd: root,
      timeoutMs: 3000,
      maxOutputChars: 3000
    });
    assert.equal(result.exitCode, 0, result.stderr);
  }
}

function patchConfig(root, verifyArgs) {
  const config = connectorConfig(root);
  config.roots[0].postPatchTarget = "verify";
  config.testTargets = [{
    id: "verify",
    executable: "/usr/bin/node",
    args: verifyArgs,
    cwd: root,
    timeoutMs: 30000,
    trust: "VERIFIED_SOURCE",
    integrityFiles: [],
    network: false,
    memoryLimitKb: 2_097_152,
    nprocLimit: 64,
    scratchSizeKb: 65_536
  }];
  return config;
}

test("valid development patch is applied, backed up and verified", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-valid-patch-"));
  await writeFile(join(root, "README.md"), "before\n", { mode: 0o644 });
  await writeFile(join(root, "verify.mjs"), "import{readFileSync}from'node:fs';if(readFileSync('README.md','utf8')!=='after\\n')process.exit(1);\n");
  await initializeRepository(root);
  const connector = new SecureConnector(patchConfig(root, ["verify.mjs"]), join(root, "audit-data"));
  const patch = [
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -1 +1 @@",
    "-before",
    "+after",
    ""
  ].join("\n");
  const result = await connector.applyPatch("dev:/README.md", patch);
  assert.equal(result.policy_decision, "ALLOWED");
  assert.equal(await readFile(join(root, "README.md"), "utf8"), "after\n");
  assert.ok(result.data.backup_id);
});

test("failed post-patch verification restores exact content", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-rollback-patch-"));
  await writeFile(join(root, "README.md"), "before\n", { mode: 0o644 });
  await writeFile(join(root, "verify.mjs"), "process.exit(1);\n");
  await initializeRepository(root);
  const connector = new SecureConnector(patchConfig(root, ["verify.mjs"]), join(root, "audit-data"));
  const patch = [
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -1 +1 @@",
    "-before",
    "+after",
    ""
  ].join("\n");
  await assert.rejects(() => connector.applyPatch("dev:/README.md", patch), /test_failed/);
  assert.equal(await readFile(join(root, "README.md"), "utf8"), "before\n");
});

test("existing untracked development file can be patched, backed up and verified", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-untracked-patch-"));

  // initializeRepository expects these baseline files to exist.
  await writeFile(join(root, "README.md"), "baseline\n", { mode: 0o644 });
  await writeFile(
    join(root, "verify.mjs"),
    "import{readFileSync}from'node:fs';if(readFileSync('UNTRACKED.md','utf8')!=='after\\n')process.exit(1);\n"
  );

  await initializeRepository(root);

  // Target deliberately appears only after repository initialization.
  // Therefore it exists on disk but is not tracked by Git.
  await writeFile(join(root, "UNTRACKED.md"), "before\n", { mode: 0o644 });

  const connector = new SecureConnector(
    patchConfig(root, ["verify.mjs"]),
    join(root, "audit-data")
  );

  const patch = [
    "diff --git a/UNTRACKED.md b/UNTRACKED.md",
    "--- a/UNTRACKED.md",
    "+++ b/UNTRACKED.md",
    "@@ -1 +1 @@",
    "-before",
    "+after",
    ""
  ].join("\n");

  const result = await connector.applyPatch("dev:/UNTRACKED.md", patch);

  assert.equal(result.policy_decision, "ALLOWED");
  assert.equal(
    await readFile(join(root, "UNTRACKED.md"), "utf8"),
    "after\n"
  );
  assert.ok(result.data.backup_id);
  assert.match(result.data.preexisting_target_state, /^\?\? /m);
});
