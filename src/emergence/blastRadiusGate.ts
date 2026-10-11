/** Advisory risk gate. Never treats an agent's own risk declaration as attestation. */
export type ImpactScope='isolated_simulation'|'internal_reversible'|'external_reversible'|'external_irreversible';
export type BlastAssessment=Readonly<{scope:ImpactScope; affectedEntities:number; estimatedCostEur:number; reversible:boolean; affectsPeople:boolean; changesAuthority:boolean; touchesProduction:boolean; attestedByIndependentMonitor:boolean}>;
export type BlastDecision=Readonly<{route:'AUTO_SANDBOX'|'AUTO_BOUNDED'|'HUMAN_APPROVAL'|'BLOCK'; reasons:readonly string[]; humanApprovalRequired:boolean; authorityGranted:false}>;
export function assessBlastRadius(x:BlastAssessment):BlastDecision {
 const reasons:string[]=[];
 const decision=(route:BlastDecision['route']):BlastDecision=>({route,reasons,humanApprovalRequired:route==='HUMAN_APPROVAL',authorityGranted:false});
 if(!x || !['isolated_simulation','internal_reversible','external_reversible','external_irreversible'].includes(x.scope) || !Number.isSafeInteger(x.affectedEntities) || x.affectedEntities<0 || !Number.isFinite(x.estimatedCostEur) || x.estimatedCostEur<0){reasons.push('invalid_impact_assessment');return decision('BLOCK')}
 if(x.changesAuthority){reasons.push('authority_change_needs_separate_governance');return decision('BLOCK')}
 if(!x.attestedByIndependentMonitor){reasons.push('independent_impact_attestation_missing');return decision('HUMAN_APPROVAL')}
 if(x.scope==='isolated_simulation'&&!x.touchesProduction&&!x.affectsPeople&&x.estimatedCostEur<=2&&x.affectedEntities<=100){reasons.push('bounded_isolated_simulation');return decision('AUTO_SANDBOX')}
 if(x.scope==='internal_reversible'&&x.reversible&&!x.touchesProduction&&!x.affectsPeople&&x.estimatedCostEur<=1&&x.affectedEntities<=10){reasons.push('bounded_internal_change');return decision('AUTO_BOUNDED')}
 reasons.push('external_or_high_impact');return decision('HUMAN_APPROVAL');
}
