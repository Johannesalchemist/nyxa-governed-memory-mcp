/**
 * Read-only forensic verifier for candidate and audit ledgers. Never calls init(),
 * append(), repairs, or mutates inspected data. Run after npm run build.
 * Examples:
 *   node scripts/verify-memory-audit-readonly.mjs /absolute/nyxa-data-dir ...
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AuditLog } from "../dist/audit/AuditLog.js";
import { CandidateStore } from "../dist/memory/candidateStore.js";
import { safeJsonStringify } from "../dist/utils/safeJson.js";
const roots = process.argv.slice(2);
if (!roots.length || roots.some(root => !root.startsWith("/"))) {
  console.error("Supply one or more absolute data-directory paths");
  process.exit(2);
}
const sha256 = value => createHash("sha256").update(value).digest("hex");
const result = {schema: "nyxa-memory-integrity-evidence-v1", at: new Date().toISOString(), roots: []};
for (const root of roots) {
  const entry = {root};
  try {
    const buf = await readFile(root + "/audit.log.jsonl");
    const rows = buf.toString("utf8").split("\n").filter(Boolean);
    const parsed = rows.map(s => {try {return JSON.parse(s);} catch {return null;}});
    const selfHashFailures = [], linkFailures = [], legacy = [], invalidJson = [];
    let previous = "GENESIS";
    for (let i=0;i<parsed.length;i++) {
      const e = parsed[i];
      if (!e) {invalidJson.push(i); continue;}
      if (!e.event_hash || !e.previous_event_hash) {legacy.push(i); previous = "GENESIS"; continue;}
      if (e.previous_event_hash !== previous) {
        linkFailures.push({index_zero_based:i, at:e.timestamp??null,
          refers_to_index_281:i===284&&e.previous_event_hash===parsed[281]?.event_hash,
          event_self_hash_valid:sha256(safeJsonStringify(Object.fromEntries(Object.entries(e).filter(([k]) => k!=="event_hash"))))===e.event_hash});
      }
      const {event_hash,...record} = e;
      if (sha256(safeJsonStringify(record))!==event_hash) selfHashFailures.push(i);
      previous = e.event_hash;
    }
    const official = await new AuditLog(root).verifyIntegrity();
    entry.audit = {
      file_sha256:sha256(buf),bytes:buf.length,entries:rows.length,
      legacy_unhashed_entries:legacy.length,legacy_first_indices:legacy.slice(0,20),
      bad_json_count:invalidJson.length,invalid_json_first_indices:invalidJson.slice(0,10),
      hash_mismatch_count:selfHashFailures.length,hash_mismatch_first_indices:selfHashFailures.slice(0,10),
      link_mismatch_count:linkFailures.length,link_mismatches:linkFailures.slice(0,10),
      first_at:parsed[0]?.timestamp??null,last_at:parsed.at(-1)?.timestamp??null,
      official
    };
  } catch (error) {entry.audit = {error:String(error.code??error.name??"unreadable")};}
  try {
    const buf = await readFile(root+"/memory/candidates.jsonl");
    const lines = await new CandidateStore(root).readLines();
    entry.candidates={valid:true, file_sha256:sha256(buf),bytes:buf.length,history_entries:lines.length};
  } catch(error){entry.candidates={valid:false,error:String(error.code??error.name??"unreadable")};}
  result.roots.push(entry);
}
result.all_candidates_valid = result.roots.every(r=>r.candidates.valid);
result.all_audit_chains_valid = result.roots.every(r=>r.audit.official?.valid===true && r.audit.link_mismatch_count===0 && r.audit.hash_mismatch_count===0);
result.all_audit_fully_hashed = result.roots.every(r=>r.audit.legacy_unhashed_entries===0);
result.all_data_cryptographically_integral = result.all_candidates_valid && result.all_audit_chains_valid && result.all_audit_fully_hashed;
console.log(JSON.stringify(result,null,2));
if (!result.all_data_cryptographically_integral) process.exitCode = 2;
