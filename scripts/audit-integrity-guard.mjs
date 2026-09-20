#!/usr/bin/env node
// Fail-safe integrity guard: runs the real AuditLog.verifyIntegrity() against one
// audit data directory. NEVER repairs, rewrites, rehashes, or deletes anything -- on
// a broken chain it only reports and marks failure, preserving the evidence exactly
// as found. Intended to run as a periodic systemd oneshot (see the accompanying
// .service/.timer units), so a failing run's own non-zero exit code and journal
// output are the primary alarm signal; the marker file below is a secondary,
// durable one that survives journal rotation.
//
// Usage: node audit-integrity-guard.mjs <dataDir> [--audit-log-module <path>]
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const dataDir = process.argv[2];
if (!dataDir) {
  console.error("usage: audit-integrity-guard.mjs <dataDir>");
  process.exit(2);
}
const moduleFlagIndex = process.argv.indexOf("--audit-log-module");
const auditLogModulePath =
  moduleFlagIndex !== -1 && process.argv[moduleFlagIndex + 1]
    ? process.argv[moduleFlagIndex + 1]
    : new URL("../dist/audit/AuditLog.js", import.meta.url).pathname;

const markerPath = join(dataDir, ".integrity-alarm.json");

async function main() {
  const { AuditLog } = await import(auditLogModulePath);
  const audit = new AuditLog(dataDir);
  await audit.init();
  const result = await audit.verifyIntegrity();
  const checkedAt = new Date().toISOString();

  if (result.valid) {
    // Healthy: no action beyond clearing a stale alarm marker from a PAST failure,
    // if one exists -- this only ever removes the guard's own marker file, never
    // anything in the audit chain itself.
    await unlink(markerPath).catch(() => {});
    console.log(JSON.stringify({ checked_at: checkedAt, data_dir: dataDir, ...result }));
    process.exit(0);
  }

  const alarm = {
    checked_at: checkedAt,
    data_dir: dataDir,
    valid: false,
    checked: result.checked,
    reason: result.reason,
    note: "AUDIT CHAIN INTEGRITY FAILURE. Evidence left untouched by design. Do not repair, rehash, or rotate without a documented decision."
  };
  await writeFile(markerPath, JSON.stringify(alarm, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  console.error(JSON.stringify(alarm));
  process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    checked_at: new Date().toISOString(),
    data_dir: dataDir,
    valid: false,
    reason: "guard_runtime_error",
    error: error instanceof Error ? error.message : String(error)
  }));
  process.exit(1);
});
