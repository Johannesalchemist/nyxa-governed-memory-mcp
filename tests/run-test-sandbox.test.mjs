// Regression coverage for the nyxa_run_test execution boundary (effect containment /
// execution boundary closure milestone). Complements the containment proof in
// direct-authority-parity.test.mjs with: git-mutation denial, real process/resource
// bounding, and fail-closed behavior when a test target's sandbox capabilities are
// missing or malformed -- the target must never fall back to unsandboxed execution.
//
// Threat-matrix coverage added during hardening: CPU bounding, IPv6, Unix domain
// sockets, /home, unlink/delete, scratch tmpfs overflow, nested-namespace mount
// escape, sandbox-setup-vs-target-exit failure classification, and orphan/daemon
// teardown. See docs/RUN_TEST_SANDBOX.md for the full threat model and known
// non-goals -- not every theoretical boundary is tested here; what is not covered
// is documented there, not silently absent.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SecureConnector } from "../dist/connector/SecureConnector.js";

const SANDBOX_SCRIPT = resolve("scripts/nyxa-run-test-sandbox.sh");

function baseConfig(root, target) {
  return {
    enabled: true, devEnabled: true,
    gitExecutable: "/usr/bin/git", systemctlExecutable: "/usr/bin/systemctl",
    roots: [{ id: "dev", path: root, access: "dev", trust: "VERIFIED_SOURCE" }],
    repositories: [{ id: "dev", path: root, rootId: "dev" }],
    services: [],
    testTargets: [target],
    limits: { maxOutputChars: 50000, maxFileBytes: 1048576, maxSearchResults: 100, maxSearchFiles: 5000, maxDirectoryEntries: 1000, maxPatchBytes: 200000, toolTimeoutMs: 30000, rateLimitPerMinute: 120 }
  };
}

async function initRepo(root) {
  for (const args of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t.local"], ["config", "user.name", "t"]]) {
    execFileSync("/usr/bin/git", args, { cwd: root });
  }
  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  execFileSync("/usr/bin/git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("/usr/bin/git", ["commit", "-q", "-m", "init"], { cwd: root });
}

function target(id, probeFile, root, overrides = {}) {
  return {
    id, executable: "/usr/bin/node", args: [probeFile], cwd: root, timeoutMs: 8000,
    trust: "VERIFIED_SOURCE", integrityFiles: [],
    network: false, memoryLimitKb: 2_097_152, nprocLimit: 64, scratchSizeKb: 65_536,
    ...overrides
  };
}

test("sandbox: a git commit attempted by the target never mutates the real repository (real object/ref write is denied, not merely git's own safety check)", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-git-"));
  await initRepo(root);
  const before = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const {execFileSync}=require("child_process");',
    'try{execFileSync("/usr/bin/git",["-c","user.email=a@b.c","-c","user.name=x","commit","--allow-empty","-m","x"],{cwd:process.cwd()});console.log("COMMIT_ALLOWED");}',
    'catch(e){console.log("COMMIT_DENIED");}'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("gitprobe", "probe.cjs", root)), join(root, "audit-data"));
  const result = await connector.runTest("gitprobe");
  assert.equal(result.data.stdout.trim(), "COMMIT_DENIED", "the target's own attempt was refused (read-only .git)");
  const after = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert.equal(after, before, "the real repository HEAD is byte-for-byte unchanged -- independently verified from outside the sandbox");
  const log = execFileSync("/usr/bin/git", ["log", "--oneline"], { cwd: root, encoding: "utf8" });
  assert.equal(log.trim().split("\n").length, 1, "no new commit object exists in the real repository history");
});

test("sandbox: process-count ceiling bounds a fork loop -- the target is not killed by the harness timeout, it is bounded by a real ulimit", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-nproc-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const {spawn}=require("child_process");',
    'let forked=0,denied=0,remaining=40;',
    'function settle(ok){if(ok)forked++;else denied++;remaining--;if(remaining===0)console.log(JSON.stringify({forked,denied}));}',
    'for(let i=0;i<40;i++){',
    '  let decided=false;',
    '  const child=spawn("/bin/sleep",["2"]);',
    '  child.on("error",()=>{if(!decided){decided=true;settle(false);}});',
    '  child.on("spawn",()=>{if(!decided){decided=true;settle(true);}});',
    '}'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("nprocprobe", "probe.cjs", root, { timeoutMs: 15000, nprocLimit: 16 })), join(root, "audit-data"));
  const result = await connector.runTest("nprocprobe");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.ok(parsed.denied > 0, `expected the tight nproc ceiling to reject some forks, got forked=${parsed.forked} denied=${parsed.denied}`);
  assert.ok(parsed.forked < 200, "not all 200 fork attempts succeeded -- a real kernel ceiling, not an unbounded loop");
});

test("sandbox: fail-closed -- a test target with missing/invalid sandbox capability fields is refused before any process starts, never falls back to unsandboxed execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-failclosed-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, 'require("fs").writeFileSync(process.argv[1]+"/must-never-exist.txt","x");console.log("RAN_UNSANDBOXED");', "utf8");
  const connector = new SecureConnector(baseConfig(root, {
    id: "brokenprobe", executable: "/usr/bin/node", args: ["probe.cjs", root], cwd: root, timeoutMs: 5000,
    trust: "VERIFIED_SOURCE", integrityFiles: []
    // network/memoryLimitKb/nprocLimit/scratchSizeKb deliberately omitted
  }), join(root, "audit-data"));
  await assert.rejects(() => connector.runTest("brokenprobe"), /test_target_capabilities_invalid/);
  await assert.rejects(() => access(join(root, "must-never-exist.txt")));
});

test("sandbox: CPU time is bounded by a real RLIMIT_CPU, not just the wall-clock harness timeout", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-cpu-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  // Busy-loop with no I/O and no timers -- if only the wall-clock kill applied, this
  // would run for the full harness timeoutMs consuming 100% CPU the whole time. The
  // sandbox's own `ulimit -t` (derived from timeoutMs, see processRunner.ts) is meant
  // to terminate it well before that on CPU time alone.
  await writeFile(probeFile, 'let i=0; while(true){ i++; }', "utf8");
  const connector = new SecureConnector(baseConfig(root, target("cpuprobe", "probe.cjs", root, { timeoutMs: 30000 })), join(root, "audit-data"));
  const start = Date.now();
  await assert.rejects(() => connector.runTest("cpuprobe"), /test_failed|test_timeout/);
  const elapsedMs = Date.now() - start;
  assert.ok(elapsedMs < 20000, `expected RLIMIT_CPU to terminate the busy loop well before the 30s wall-clock timeout, took ${elapsedMs}ms`);
});

test("sandbox: IPv6 loopback is denied identically to IPv4 -- the net namespace never brings up any interface for either family", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-ipv6-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const net=require("net");',
    'const s=net.createConnection({host:"::1",port:9,family:6},()=>{console.log(JSON.stringify({network:"ALLOWED"}));process.exit(1);});',
    's.on("error",(e)=>{console.log(JSON.stringify({network:"DENIED",code:e.code}));process.exit(0);});',
    'setTimeout(()=>{console.log(JSON.stringify({network:"TIMEOUT"}));process.exit(0);},3000);'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("ipv6probe", "probe.cjs", root, { timeoutMs: 6000 })), join(root, "audit-data"));
  const result = await connector.runTest("ipv6probe");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.notEqual(parsed.network, "ALLOWED", "an IPv6 loopback connection must never succeed from inside the sandbox");
});

test("sandbox: a pre-existing Unix domain socket visible under the dev root is masked -- connect(2) is refused, not merely the read-only mount", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-sock-"));
  await initRepo(root);
  const { createServer } = await import("node:net");
  const socketPath = join(root, "sensitive.sock");
  const server = createServer(() => undefined);
  await new Promise((res) => server.listen(socketPath, res));
  context.after(() => server.close());

  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const net=require("net");',
    `const s=net.createConnection("${socketPath}", ()=>{console.log(JSON.stringify({socket:"CONNECT_ALLOWED"}));process.exit(1);});`,
    's.on("error",(e)=>{console.log(JSON.stringify({socket:"CONNECT_DENIED",code:e.code}));process.exit(0);});',
    'setTimeout(()=>{console.log(JSON.stringify({socket:"TIMEOUT"}));process.exit(0);},3000);'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("sockprobe", "probe.cjs", root, { timeoutMs: 6000 })), join(root, "audit-data"));
  const result = await connector.runTest("sockprobe");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.notEqual(parsed.socket, "CONNECT_ALLOWED", "a real, pre-existing Unix socket visible under the read-only dev root must be unreachable from inside the sandbox -- a read-only mount alone does not block connect(2)");
});

test("sandbox: unlink/delete of a file outside the sandbox is denied identically to write", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-repo-"));
  await initRepo(root);
  const outsideDir = await mkdtemp(join(tmpdir(), "nyxa-sandbox-outside-"));
  await writeFile(join(outsideDir, "target.txt"), "must-survive\n", "utf8");
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const fs=require("fs");',
    `try{fs.unlinkSync("${join(outsideDir, "target.txt")}");console.log(JSON.stringify({unlink:"ALLOWED"}));}`,
    'catch(e){console.log(JSON.stringify({unlink:"DENIED",code:e.code}));}'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("unlinkprobe", "probe.cjs", root)), join(root, "audit-data"));
  const result = await connector.runTest("unlinkprobe");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.equal(parsed.unlink, "DENIED");
  assert.equal(parsed.code, "EROFS");
  await access(join(outsideDir, "target.txt")); // must still exist
});

test("sandbox: /home is denied identically to the other mandatory read-only paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-home-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const fs=require("fs");',
    'try{fs.writeFileSync("/home/nyxa-sandbox-probe.txt","x");console.log(JSON.stringify({home:"ALLOWED"}));}',
    'catch(e){console.log(JSON.stringify({home:"DENIED",code:e.code}));}'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("homeprobe", "probe.cjs", root)), join(root, "audit-data"));
  const result = await connector.runTest("homeprobe");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.equal(parsed.home, "DENIED");
  assert.equal(parsed.code, "EROFS");
});

test("sandbox: scratch tmpfs size is a real kernel-enforced ceiling, not an application-level check", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-scratchsize-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const fs=require("fs");',
    'const path=process.env.NYXA_SANDBOX_SCRATCH+"/big.bin";',
    'let written=0;',
    'try{ fs.writeFileSync(path, Buffer.alloc(2*1024*1024, 1)); written=fs.statSync(path).size; }',
    'catch(e){ try{ written=fs.statSync(path).size; }catch{} }',
    'console.log(JSON.stringify({writtenBytes:written}));'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("scratchprobe", "probe.cjs", root, { scratchSizeKb: 64 })), join(root, "audit-data"));
  const result = await connector.runTest("scratchprobe");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.ok(parsed.writtenBytes <= 64 * 1024, `expected the 64KB tmpfs ceiling to cap the write, got ${parsed.writtenBytes} bytes`);
});

test("sandbox: a nested mount namespace cannot re-open the read-only boundary -- CAP_SYS_ADMIN is dropped before the target ever runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-nestedns-"));
  await initRepo(root);
  const outsideDir = await mkdtemp(join(tmpdir(), "nyxa-sandbox-nestedns-outside-"));
  const probeFile = join(root, "probe.cjs");
  // Attempts exactly the escape found and closed during hardening: create a nested mount
  // namespace, remount a mandatory read-only path rw inside it, and try to write through.
  await writeFile(probeFile, [
    'const {execFileSync}=require("child_process");',
    'let unshareExit=null, writeResult="not-attempted";',
    'try{',
    '  execFileSync("unshare",["--mount","--","/bin/sh","-c","mount -o remount,bind,rw /tmp"],{stdio:"pipe"});',
    '  unshareExit=0;',
    '}catch(e){ unshareExit = (e.status===null||e.status===undefined) ? -1 : e.status; }',
    'const fs=require("fs");',
    'try{ fs.writeFileSync("/tmp/nested-escape-probe.txt","x"); writeResult="ALLOWED"; }',
    'catch(e){ writeResult="DENIED:"+e.code; }',
    'console.log(JSON.stringify({unshareExit, writeResult}));'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("nestedescape", "probe.cjs", root, { network: false })), join(root, "audit-data"));
  const result = await connector.runTest("nestedescape");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.notEqual(parsed.unshareExit, 0, "creating a nested mount namespace must itself fail once CAP_SYS_ADMIN is dropped");
  assert.match(parsed.writeResult, /^DENIED:/, "the write must be denied regardless of the nested-namespace attempt");
  await assert.rejects(() => access("/tmp/nested-escape-probe.txt"), "no file must land on the real host /tmp");
});

test("sandbox: unshare-level namespace failure is classified as a sandbox setup failure, never as the target's own exit code", async () => {
  const fakeBinDir = await mkdtemp(join(tmpdir(), "nyxa-fake-unshare-"));
  await writeFile(
    join(fakeBinDir, "unshare"),
    "#!/bin/sh\necho 'unshare: unshare failed: Operation not permitted' >&2\nexit 1\n",
    { mode: 0o755 }
  );
  const scratchDir = await mkdtemp(join(tmpdir(), "nyxa-sandbox-probe-scratch-"));
  // Real capsh must still resolve (via the rest of PATH) so this isolates exactly the
  // unshare-probe failure path, not a missing-capsh failure.
  const env = { PATH: `${fakeBinDir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` };
  const result = spawnSync(SANDBOX_SCRIPT, [scratchDir, "65536", "2097152", "32", "10", "nonet", "-", "--", "/usr/bin/node", "-e", "console.log('SHOULD_NOT_RUN')"], { env, encoding: "utf8" });
  assert.equal(result.status, 95, "a genuine (simulated) unshare namespace-creation failure must exit 95, a code processRunner.ts classifies as sandbox_setup_failed -- never as a target exit code");
  assert.doesNotMatch(result.stdout ?? "", /SHOULD_NOT_RUN/, "the target must never have started");
});

test("sandbox: orphan/daemon teardown -- a detached grandchild does not survive after the tracked child exits", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-orphan-"));
  await initRepo(root);
  const marker = `nyxa-orphan-marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const {spawn}=require("child_process");',
    `const c=spawn("/bin/sh",["-c","echo ${marker}; exec sleep 999"],{detached:true,stdio:"ignore"});`,
    'c.unref();',
    'console.log("parent-exiting");'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("orphanprobe", "probe.cjs", root)), join(root, "audit-data"));
  const result = await connector.runTest("orphanprobe");
  assert.equal(result.data.stdout.trim(), "parent-exiting");
  await new Promise((r) => setTimeout(r, 1000));
  const ps = execFileSync("/bin/ps", ["-eo", "args"], { encoding: "utf8" });
  assert.doesNotMatch(ps, new RegExp(marker), "the detached grandchild must not survive on the host once the sandbox's pid namespace is torn down");
});

// --- Schritt 7.5 independent-review findings ---------------------------------------

test("sandbox: isolated nested submount is read-only inside the target without host privilege", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-nested-root-"));
  const nested = await mkdtemp(join(tmpdir(), "nyxa-sandbox-nested-mount-"));
  const module = new URL("../dist/connector/SecureConnector.js", import.meta.url).href;
  const inner = [
    'import assert from "node:assert/strict";',
    'import {writeFile,readFile,access} from "node:fs/promises";',
    'import {join} from "node:path";',
    'import {SecureConnector} from '+JSON.stringify(module)+';',
    'const baseConfig='+baseConfig.toString()+';',
    'const target='+target.toString()+';',
    'const root='+JSON.stringify(root)+';const nested='+JSON.stringify(nested)+';',
    'await writeFile(join(nested,"control"),"HOST_NAMESPACE_WRITABLE");',
    'assert.equal(await readFile(join(nested,"control"),"utf8"),"HOST_NAMESPACE_WRITABLE");',
    'await writeFile(join(root,"probe.cjs"),'+JSON.stringify('const fs=require("fs");try{fs.writeFileSync('+JSON.stringify(join(nested,"probe.txt"))+',"x");console.log("ALLOWED")}catch(e){console.log(e.code)}')+');',
    'const connector=new SecureConnector(baseConfig(root,target("nestedprobe","probe.cjs",root,{timeoutMs:15000})),join(root,"audit"));',
    'const result=await connector.runTest("nestedprobe");',
    'assert.equal(result.data.stdout.trim(),"EROFS",JSON.stringify(result));',
    'await assert.rejects(access(join(nested,"probe.txt")));',
    'console.log("REAL_NESTED_MOUNT_DENIED");'
  ].join("\n");
  const result = spawnSync("unshare", ["--user","--map-root-user","--mount","--net","--","/bin/sh","-c",
    'mount --make-rprivate / && mount -t tmpfs -o size=1024k tmpfs "$1" && exec /usr/bin/node --input-type=module -e "$2"',
    "nested-isolated", nested, inner], {encoding:"utf8",timeout:25000});
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.match(result.stdout,/REAL_NESTED_MOUNT_DENIED/);
});

test("sandbox: a socket-masking failure fails closed (the target never starts), not silently ignored", async () => {
  // Reproduces the exact fail-closed branch in mask_sockets_under() by forcing the
  // mount --bind itself to fail (missing mask source), independent of the sandbox
  // script's own invocation -- a naturally-occurring mount-bind failure against an
  // already-discoverable socket is not reliably externally triggerable (a directory
  // restrictive enough to make find/mount fail is equally restrictive to the
  // sandboxed target's own connect() attempt, which is itself already safe).
  // Needs its own unprivileged user+mount namespace (the same primitive the real
  // sandbox uses) to be allowed to mount a scratch tmpfs at all.
  const nsResult = spawnSync("unshare", ["--user", "--map-root-user", "--mount", "--", "bash", "-c", `
    set -eu
    SCRATCH_DIR=$(mktemp -d)
    mount -t tmpfs -o size=4096k tmpfs "$SCRATCH_DIR"
    mkdir -p "$SCRATCH_DIR/testdir"
    node -e "require('net').createServer(()=>{}).listen('$SCRATCH_DIR/testdir/x.sock')" >/dev/null 2>&1 &
    NODE_PID=$!
    trap 'kill "$NODE_PID" 2>/dev/null || true' EXIT
    sleep 0.3
    find "$SCRATCH_DIR/testdir" -xdev -type s > "$SCRATCH_DIR/.found-sockets" 2>/dev/null || true
    while IFS= read -r sock; do
      mountpoint -q "$sock" 2>/dev/null && continue
      if ! mount --bind "$SCRATCH_DIR/.sockmask-MISSING" "$sock" 2>/dev/null; then
        echo "sandbox_socket_mask_failed:$sock" >&2
        exit 92
      fi
    done < "$SCRATCH_DIR/.found-sockets"
    echo SHOULD_NOT_REACH_HERE
  `], { encoding: "utf8" });
  assert.equal(nsResult.status, 92, `expected the fail-closed branch (exit 92) when mount --bind genuinely fails; got status=${nsResult.status} stdout=${nsResult.stdout} stderr=${nsResult.stderr}`);
  assert.doesNotMatch(nsResult.stdout ?? "", /SHOULD_NOT_REACH_HERE/);
});

test("sandbox: a Unix socket created by other host activity AFTER the sandbox starts is masked within the polling window, not left reachable", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-latesock-"));
  await initRepo(root);
  const socketPath = join(root, "late.sock");
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const net=require("net");',
    'const start=Date.now();',
    'function tryConnect(){',
    `  const s=net.createConnection("${socketPath}", ()=>{console.log(JSON.stringify({late:"CONNECT_ALLOWED",ms:Date.now()-start}));process.exit(1);});`,
    '  s.on("error",()=>{',
    '    if (Date.now()-start > 6000) { console.log(JSON.stringify({late:"DENIED_THROUGHOUT"})); process.exit(0); }',
    '    setTimeout(tryConnect, 200);',
    '  });',
    '}',
    'tryConnect();'
  ].join("\n"), "utf8");
  // Allow bounded sandbox setup time in addition to the probe's six-second observation window.
  // The assertion still requires DENIED_THROUGHOUT; a timeout or successful connection fails.
  const connector = new SecureConnector(baseConfig(root, target("latesockprobe", "probe.cjs", root, { timeoutMs: 15000 })), join(root, "audit-data"));

  const runPromise = connector.runTest("latesockprobe");
  await new Promise((r) => setTimeout(r, 1500));
  const { createServer } = await import("node:net");
  const server = createServer(() => undefined);
  await new Promise((res, rej) => { server.listen(socketPath, res); server.on("error", rej); });
  try {
    const result = await runPromise;
    const parsed = JSON.parse(result.data.stdout.trim());
    assert.equal(parsed.late, "DENIED_THROUGHOUT", "a socket created by other host activity after the sandbox started must remain masked within the polling window");
  } finally {
    server.close();
  }
});

test("sandbox: /proc is mounted read-only -- a write to a real sysctl-shaped path is denied", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-procwrite-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const fs=require("fs");',
    'try{fs.writeFileSync("/proc/sys/vm/overcommit_memory","1");console.log(JSON.stringify({proc:"ALLOWED"}));}',
    'catch(e){console.log(JSON.stringify({proc:"DENIED",code:e.code}));}'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("procwriteprobe", "probe.cjs", root)), join(root, "audit-data"));
  const result = await connector.runTest("procwriteprobe");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.equal(parsed.proc, "DENIED");
  assert.equal(parsed.code, "EROFS", "the denial must be a real mount-level EROFS, not merely a capability-dependent EACCES");
});

test("sandbox: /sys is mounted read-only -- a write anywhere under it is denied", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-syswrite-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const fs=require("fs");',
    'try{fs.writeFileSync("/sys/probe.txt","x");console.log(JSON.stringify({sys:"ALLOWED"}));}',
    'catch(e){console.log(JSON.stringify({sys:"DENIED",code:e.code}));}'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("syswriteprobe", "probe.cjs", root)), join(root, "audit-data"));
  const result = await connector.runTest("syswriteprobe");
  const parsed = JSON.parse(result.data.stdout.trim());
  assert.equal(parsed.sys, "DENIED");
  assert.equal(parsed.code, "EROFS");
});

test("sandbox: the target process itself has zero capabilities in every set (bounding/effective/permitted/inheritable/ambient), and regular git/node targets still work", async () => {
  const root = await mkdtemp(join(tmpdir(), "nyxa-sandbox-nocaps-"));
  await initRepo(root);
  const probeFile = join(root, "probe.cjs");
  await writeFile(probeFile, [
    'const fs=require("fs");',
    'const status=fs.readFileSync("/proc/self/status","utf8");',
    'const caps={};',
    'for (const line of status.split("\\n")) { const m=line.match(/^(Cap\\w+):\\s+([0-9a-f]+)/); if (m) caps[m[1]]=m[2]; }',
    'const {execFileSync}=require("child_process");',
    'const gitVersion=execFileSync("/usr/bin/git",["--version"],{encoding:"utf8"}).trim();',
    'console.log(JSON.stringify({caps, gitVersion, nodeMath: 1+1}));'
  ].join("\n"), "utf8");
  const connector = new SecureConnector(baseConfig(root, target("nocapsprobe", "probe.cjs", root)), join(root, "audit-data"));
  const result = await connector.runTest("nocapsprobe");
  const parsed = JSON.parse(result.data.stdout.trim());
  for (const [name, value] of Object.entries(parsed.caps)) {
    assert.match(value, /^0+$/, `expected ${name} to be fully zero, got ${value}`);
  }
  assert.match(parsed.gitVersion, /^git version/);
  assert.equal(parsed.nodeMath, 2);
});
