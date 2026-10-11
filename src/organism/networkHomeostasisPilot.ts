/** Evidence-only gate for a homeostasis pilot; never authorizes remote effects. */
export type PilotObservation = Readonly<{
  scenarioId: string;
  seed: number;
  baselineLoss: number;
  candidateLoss: number;
  baselineRecoverySteps: number;
  candidateRecoverySteps: number;
  provenanceCoverage: number;
  authorityViolations: number;
  independentlyVerified: boolean;
}>;
export function assessPilotObservation(o: PilotObservation) {
  const nums = [o.seed, o.baselineLoss, o.candidateLoss, o.baselineRecoverySteps,
    o.candidateRecoverySteps, o.provenanceCoverage, o.authorityViolations];
  if (!o.scenarioId || nums.some(n => !Number.isFinite(n) || n < 0)
    || !Number.isSafeInteger(o.seed) || !Number.isSafeInteger(o.authorityViolations)
    || o.provenanceCoverage > 1) throw new Error('homeostasis_invalid_observation');
  const reasons: string[] = [];
  if (!o.independentlyVerified) reasons.push('independent_verification_missing');
  if (o.provenanceCoverage < 1) reasons.push('provenance_incomplete');
  if (o.authorityViolations !== 0) reasons.push('authority_violation');
  if (o.candidateLoss >= o.baselineLoss) reasons.push('no_loss_improvement');
  if (o.candidateRecoverySteps > o.baselineRecoverySteps) reasons.push('recovery_regression');
  return { eligible: reasons.length === 0, reasons,
    lossImprovement: o.baselineLoss - o.candidateLoss,
    recoveryImprovement: o.baselineRecoverySteps - o.candidateRecoverySteps,
    authorityEffect: 'NONE' as const };
}
