export type FailureGenome={
  id:string;
  failureClass:string;
  exploitedAssumption:string;
  minimalReproductionRef:string;
  affectedInvariant:string;
  causalDiagnosis:string;
  repairRef:string;
  replayEvidenceRef:string;
  variantEvidenceRefs:readonly string[];
  regressionEvidenceRef:string;
  independentVerificationRef:string;
  authorityEffect:"NONE";
};

export type FailureGenomeAssessment={
  complete:boolean;
  authorityEffect:"NONE";
  reasons:readonly string[];
};

const present=(v:string)=>v.trim().length>0;

export function assessFailureGenome(g:FailureGenome):FailureGenomeAssessment{
  const reasons:string[]=[];
  if(!present(g.id))reasons.push("failure_genome_id_missing");
  if(!present(g.failureClass))reasons.push("failure_class_missing");
  if(!present(g.exploitedAssumption))reasons.push("exploited_assumption_missing");
  if(!present(g.minimalReproductionRef))reasons.push("minimal_reproduction_missing");
  if(!present(g.affectedInvariant))reasons.push("affected_invariant_missing");
  if(!present(g.causalDiagnosis))reasons.push("causal_diagnosis_missing");
  if(!present(g.repairRef))reasons.push("repair_missing");
  if(!present(g.replayEvidenceRef))reasons.push("replay_evidence_missing");
  if(g.variantEvidenceRefs.length===0||g.variantEvidenceRefs.some(v=>!present(v)))reasons.push("variant_evidence_missing");
  if(!present(g.regressionEvidenceRef))reasons.push("regression_evidence_missing");
  if(!present(g.independentVerificationRef))reasons.push("independent_verification_missing");
  if(g.authorityEffect!=="NONE")reasons.push("authority_effect_rejected");
  return{complete:reasons.length===0,authorityEffect:"NONE",reasons};
}

export function failureGenomeRetentionGate(g:FailureGenome){
  const assessment=assessFailureGenome(g);
  return{
    outcome:assessment.complete?"RETENTION_EVIDENCE_READY" as const:"HOLD" as const,
    failureClass:g.failureClass,
    authorityEffect:"NONE" as const,
    reasons:assessment.reasons
  };
}
