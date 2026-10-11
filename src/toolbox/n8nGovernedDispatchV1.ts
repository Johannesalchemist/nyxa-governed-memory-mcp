import { planN8nRequest, type N8nRequest, type N8nTransport } from "./n8nOperatorV1.js";

/** Only the trusted NYXA server may implement this verifier. Never accept caller approval booleans. */
export type VerifiedN8nDecision = {
  allowed: boolean;
  decisionId: string;
  action: string;
  target: string;
  payloadHash: string;
  expiresAt: number;
  independent: boolean;
};
export type N8nGovernanceVerifier = (request: {
  action: string;
  target: string;
  payloadHash: string;
  effect: boolean;
}) => Promise<VerifiedN8nDecision>;
export type N8nAuditSink = (event: {
  decisionId: string;
  action: string;
  target: string;
  payloadHash: string;
  outcome: "denied" | "executed" | "failed";
}) => Promise<void>;
export type N8nPayloadHasher = (value: unknown) => string;

/** Dispatch boundary. Production integration must bind an independent server-side verifier. */
export async function dispatchGovernedN8n(
  request: N8nRequest,
  dependencies: { verify: N8nGovernanceVerifier; transport: N8nTransport; audit: N8nAuditSink; hash: N8nPayloadHasher; now: () => number }
) {
  const plan = planN8nRequest(request);
  const payloadHash = dependencies.hash({ action: request.action, id: request.id ?? null, body: request.body ?? null });
  const decision = await dependencies.verify({ action: plan.action, target: plan.target, payloadHash, effect: plan.effect });
  const valid = decision.allowed && decision.action === plan.action && decision.target === plan.target && decision.payloadHash === payloadHash && decision.expiresAt > dependencies.now() && (!plan.effect || decision.independent);
  if (!valid) {
    await dependencies.audit({ decisionId: decision.decisionId, action: plan.action, target: plan.target, payloadHash, outcome: "denied" });
    throw new Error("governance_denied");
  }
  try {
    const result = await dependencies.transport({ method: plan.method, path: plan.path, ...(request.body ? { body: request.body } : {}) });
    await dependencies.audit({ decisionId: decision.decisionId, action: plan.action, target: plan.target, payloadHash, outcome: "executed" });
    return result;
  } catch (error) {
    await dependencies.audit({ decisionId: decision.decisionId, action: plan.action, target: plan.target, payloadHash, outcome: "failed" });
    throw error;
  }
}
