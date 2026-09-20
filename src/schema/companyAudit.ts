import { z } from "zod";

export const AUDIT_EPISTEMIC_TYPES = [
  "FACT",
  "ESTIMATE",
  "CLAIM",
  "HYPOTHESIS",
  "MISSING_DATA"
] as const;

export const AUDIT_CATEGORIES = [
  "company",
  "product",
  "customer",
  "customer_origin",
  "referral_reason",
  "market",
  "sales",
  "marketing",
  "process",
  "people",
  "system",
  "finance",
  "constraint",
  "risk",
  "goal",
  "kpi"
] as const;

export const AUDIT_SOURCES = [
  "ceo_interview",
  "employee_interview",
  "customer_interview",
  "accounting",
  "crm",
  "website",
  "document",
  "system",
  "measurement",
  "external_evidence"
] as const;

export const AUDIT_EVIDENCE_STATUSES = [
  "NONE",
  "REQUESTED",
  "PROVIDED",
  "VERIFIED",
  "CONTRADICTED"
] as const;

export const AuditObservationInputSchema = z.object({
  tenant_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  audit_id: z.string().uuid(),
  category: z.enum(AUDIT_CATEGORIES),
  field_path: z.string().min(1).max(300),
  value: z.unknown(),
  epistemic_type: z.enum(AUDIT_EPISTEMIC_TYPES),
  source: z.enum(AUDIT_SOURCES),
  confidence: z.number().min(0).max(1),
  evidence_status: z.enum(AUDIT_EVIDENCE_STATUSES),
  observed_at: z.string().datetime(),
  speaker: z.string().min(1).max(200),
  notes: z.string().max(2000).optional()
}).strict();

export type AuditObservationInput =
  z.infer<typeof AuditObservationInputSchema>;

export const AuditObservationSchema = AuditObservationInputSchema.extend({
  id: z.string().uuid(),
  writtenAt: z.string().datetime(),
  writtenBy: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200)
}).strict();

export type AuditObservation =
  z.infer<typeof AuditObservationSchema>;
