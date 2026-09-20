import { z } from "zod";
import { SrmClaimSchema } from "../srm/types.js";

const capabilityClassEnum = z.enum(["I0", "I1", "I2", "I3"]);

/**
 * Structured Proposal / Intent envelope. This is the model/agent-facing front door to governed
 * execution: nothing described here is trusted on its own. `estimatedIrreversibility` and
 * `requestedCapabilityClass` are the PROPOSER's self-report and gamma (governance/gamma.ts)
 * independently checks them against ground truth (the tool's real ToolPolicy.capabilityClass) —
 * a proposer that under-claims risk is a denial, not a shortcut.
 *
 * `rationale` (the alpha slot: argument FOR the action) and `opposition` (the beta slot:
 * argument AGAINST it) are free-text, may be LLM-generated, and are recorded for audit / human
 * review only. evaluateProposal() in gamma.ts never reads these two fields — deterministic
 * enforcement must not depend on an LLM's own argument for why its action should be allowed.
 */
export const ProposalSchema = z
  .object({
    actor: z.string().min(1).max(200),
    action: z.string().min(1).max(128),
    target: z.string().min(1).max(1000),
    scope: z.string().min(1).max(2000),
    claims: z.array(SrmClaimSchema).min(1, "claims_required_for_provenance"),
    uncertainty: z.number().min(0).max(1),
    requestedCapabilityClass: capabilityClassEnum,
    estimatedIrreversibility: capabilityClassEnum,
    provenance: z
      .object({
        taskId: z.string().min(1).max(200),
        runId: z.string().min(1).max(200),
        requestingIdentity: z.string().min(1).max(200)
      })
      .strict(),
    rationale: z.string().max(4000).optional(),
    opposition: z.string().max(4000).optional(),
    // Structured write content for actions whose effect can't be expressed as a single
    // target string (e.g. self-model domain writes). Optional and additive: no existing
    // proposal or test that omits it is affected. Each dispatch case in server.ts decides for
    // itself how to interpret this — gamma never reads it, matching the treatment of
    // rationale/opposition.
    payload: z.record(z.string(), z.unknown()).optional(),
    // C0 target-safety (governance/c0.ts): the proposer's optional, self-declared claim about
    // which server this proposal is meant for. Verified against /etc/server-identity.json
    // BEFORE gamma's C1-C5 ever run — see server.ts's handleProposeAction. Optional and
    // additive: a proposal that omits it passes C0 in compatibility mode (see c0.ts), so no
    // existing caller/test that doesn't set it is affected. Gamma itself never reads this
    // field, matching the treatment of rationale/opposition/payload above.
    expected_target: z.string().min(1).max(200).optional()
  })
  .strict();

export type Proposal = z.infer<typeof ProposalSchema>;
export type ValidatedProposal = Proposal;

export class ProposalValidationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly issues?: unknown
  ) {
    super(message);
    this.name = "ProposalValidationError";
  }
}

/**
 * Parses and validates a raw proposal. Distinguishes the "missing provenance/evidence" case
 * (an empty claims[] array) from generic schema noise with its own error code, because gamma's
 * C4 check assumes a proposal that reached it already has at least one claim.
 */
export function parseProposal(value: unknown): ValidatedProposal {
  const result = ProposalSchema.safeParse(value);
  if (!result.success) {
    const emptyClaimsIssue = result.error.issues.find(
      (issue) => issue.path.join(".") === "claims" && issue.code === "too_small"
    );
    if (emptyClaimsIssue) {
      throw new ProposalValidationError(
        "missing_provenance_evidence",
        "Proposal has no supporting claims.",
        result.error.issues
      );
    }
    throw new ProposalValidationError("proposal_invalid", "Proposal failed schema validation.", result.error.issues);
  }
  return result.data;
}
