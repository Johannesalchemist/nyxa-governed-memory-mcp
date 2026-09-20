import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CompanyAuditStore } from "../dist/company-audit/store.js";

const ALLOW = {
  outcome: "ALLOW",
  reason: "company-audit-integrity-test"
};

test("company audit read accepts intact chain and fails closed on tamper", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-company-audit-"));
  const auditId = "5f6e5d42-4d66-4f43-9d0f-8c3e99d15a01";

  const store = new CompanyAuditStore(dataDir);
  await store.init();

  await store.writeObservation(
    `company-audit:/${auditId}`,
    {
      audit_id: auditId,
      category: "company",
      field_path: "company.name",
      value: "Integrity Test GmbH",
      epistemic_type: "CLAIM",
      source: "ceo_interview",
      confidence: 0.8,
      evidence_status: "NONE",
      observed_at: new Date().toISOString(),
      speaker: "test-speaker"
    },
    {
      writtenBy: "integrity-test",
      taskId: "task-integrity",
      runId: "run-integrity"
    },
    ALLOW
  );

  const intact = await store.readAudit(auditId);
  assert.equal(intact.length, 1);
  assert.equal(intact[0].value, "Integrity Test GmbH");

  const path = join(dataDir, "company-audit", "observations.jsonl");
  const raw = await readFile(path, "utf8");
  const line = JSON.parse(raw.trim());

  line.value = "TAMPERED WITHOUT REHASH";
  await writeFile(path, `${JSON.stringify(line)}\n`, "utf8");

  await assert.rejects(
    () => store.readAudit(auditId),
    /company_audit_chain_invalid/
  );

  const restarted = new CompanyAuditStore(dataDir);

  await assert.rejects(
    () => restarted.init(),
    /company_audit_chain_invalid/
  );
});
