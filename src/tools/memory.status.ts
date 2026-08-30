import type { MemoryBackend } from "../backend/MemoryBackend.js";
import type { AuditLog } from "../audit/AuditLog.js";

/**
 * Reuses LocalBackend.health() and the existing audit-chain integrity check verbatim. Reports
 * MemoryCandidate/MemoryRecord (schema/candidates.ts, schema/memory.ts) honestly as
 * not-implemented rather than fabricating contents: nothing in this codebase persists or reads
 * them today.
 */
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
      implemented: false,
      reason:
        "MemoryCandidate/MemoryRecord schemas exist (schema/candidates.ts, schema/memory.ts) " +
        "but nothing in this codebase writes or reads them yet."
    }
  };
}
