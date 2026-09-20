import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CompanyAuditStore } from "../dist/company-audit/store.js";

const ALLOW = {
  outcome: "ALLOW",
  reason: "tenant-isolation-test"
};

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AUDIT = "5f6e5d42-4d66-4f43-9d0f-8c3e99d15a01";

const target = (tenant, organization, audit) =>
  `company-audit:/tenant/${tenant}/organization/${organization}/audit/${audit}`;

const payload = (tenant, organization, value) => ({
  tenant_id: tenant,
  organization_id: organization,
  audit_id: AUDIT,
  category: "company",
  field_path: "company.name",
  value,
  epistemic_type: "CLAIM",
  source: "ceo_interview",
  confidence: 0.8,
  evidence_status: "NONE",
  observed_at: new Date().toISOString(),
  speaker: "tenant-isolation-test"
});

const meta = {
  writtenBy: "tenant-isolation-test",
  taskId: "tenant-task",
  runId: "tenant-run"
};

test("company audit isolates tenant and organization boundaries", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-tenant-boundary-"));
  const store = new CompanyAuditStore(dataDir);
  await store.init();

  await store.writeObservation(
    target(TENANT_A, ORG_A, AUDIT),
    payload(TENANT_A, ORG_A, "Tenant A Company"),
    meta,
    ALLOW
  );

  await store.writeObservation(
    target(TENANT_B, ORG_B, AUDIT),
    payload(TENANT_B, ORG_B, "Tenant B Company"),
    { ...meta, taskId: "tenant-task-b", runId: "tenant-run-b" },
    ALLOW
  );

  const a = await store.readAudit(TENANT_A, ORG_A, AUDIT);
  const b = await store.readAudit(TENANT_B, ORG_B, AUDIT);

  assert.equal(a.length, 1);
  assert.equal(a[0].value, "Tenant A Company");
  assert.equal(b.length, 1);
  assert.equal(b[0].value, "Tenant B Company");

  assert.deepEqual(
    await store.readAudit(TENANT_A, ORG_B, AUDIT),
    []
  );

  assert.deepEqual(
    await store.readAudit(TENANT_B, ORG_A, AUDIT),
    []
  );

  await assert.rejects(
    () =>
      store.writeObservation(
        target(TENANT_B, ORG_B, AUDIT),
        payload(TENANT_A, ORG_A, "CROSS TENANT ATTACK"),
        { ...meta, taskId: "attack", runId: "attack" },
        ALLOW
      ),
    /company_audit_target_mismatch/
  );

  assert.equal(
    await store.observationAppendRadius(
      target(TENANT_B, ORG_B, AUDIT),
      payload(TENANT_A, ORG_A, "RADIUS SPOOF")
    ),
    undefined
  );
});
