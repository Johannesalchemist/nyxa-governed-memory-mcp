// Standalone worker process for the multi-process AuditLog regression test
// (tests/audit-multiprocess.test.mjs). Deliberately a separate OS process, not a
// function called in-process -- the bug under test only exists across process
// boundaries (independent in-memory previousEventHash per process), so an in-process
// simulation would not exercise it.
import { AuditLog } from "../../dist/audit/AuditLog.js";

const [, , dataDir, processId, countRaw] = process.argv;
const count = Number(countRaw);

async function main() {
  const audit = new AuditLog(dataDir);
  await audit.init();
  for (let i = 0; i < count; i += 1) {
    await audit.append({
      id: `p${processId}-e${i}`,
      timestamp: new Date().toISOString(),
      actor: "concurrency-test",
      action: "concurrency-probe",
      tool: "concurrency-probe",
      mode: "observe_only",
      backend: "test",
      result: "allowed",
      details: { pid: process.pid, processId, seq: i }
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
