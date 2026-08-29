import { z } from "zod";

/**
 * Shared Reference Model (SRM) epistemic-status tags. Every claim a proposal relies on must
 * declare which of these it is — this is what lets gamma tell a verified fact apart from an
 * unverified model guess instead of treating all input text as equally trustworthy.
 */
export const SRM_TAGS = [
  "FACT",
  "CLAIM",
  "INFERENCE",
  "HYPOTHESIS",
  "MEMORY",
  "SIMULATION",
  "MODEL_OUTPUT",
  "EXTERNAL_EVIDENCE"
] as const;

export type SrmTag = (typeof SRM_TAGS)[number];

export function validateSrmTag(tag: unknown): tag is SrmTag {
  return typeof tag === "string" && (SRM_TAGS as readonly string[]).includes(tag);
}

export const SrmClaimSchema = z
  .object({
    tag: z.enum(SRM_TAGS),
    statement: z.string().min(1).max(2000),
    source: z.string().min(1).max(500),
    asOf: z.string().datetime().optional()
  })
  .strict();

export type SrmClaim = z.infer<typeof SrmClaimSchema>;
