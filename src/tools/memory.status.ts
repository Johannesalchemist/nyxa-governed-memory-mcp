import type { MemoryBackend } from "../backend/MemoryBackend.js";
import type { AuditLog } from "../audit/AuditLog.js";

/** Backend and audit health; candidate persistence is implemented by CandidateStore. */
export async function buildMemoryStatus(backend: MemoryBackend, auditLog: AuditLog) {
  const health = await backend.health();
  const recent = await auditLog.recent(1);
  const integrity = await auditLog.verifyIntegrity();
  return {
    backend: health,
    audit_log: {
      integrity_valid: integrity.valid,
      entries_checked: integrity.checked,
      integrity_failure_reason: integrity.reason ?? null,
      latest_event_timestamp: recent[0]?.timestamp ?? null
    },
    memory_candidates: {
      implemented: true,
      implementation: "src/memory/candidateStore.ts",
      reason: "CandidateStore persists, recalls and promotes candidates. Writes require governance; promotion requires human authority. Implementation status does not establish write permission or candidate-store integrity."
    }
  };
}
