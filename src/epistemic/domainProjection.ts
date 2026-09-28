import { assessTrajectory, type EpistemicTurn, type TrajectoryKpis } from "./trajectory.js";
export type ExperienceDomain="INDUSTRIAL_TWIN"|"AGENT_GOVERNANCE"|"LEARNING"|"WORLD_TWIN";
export type DomainObservation={id:string;domain:ExperienceDomain;at_ms:number;meaning_space_id:string;perspective:string;residual:number;valence:number;relation_refs:string[];provenance_roots:string[];impact:number;energy_joules?:number};
export type DomainProjection={domain:ExperienceDomain;kpis:TrajectoryKpis;corrective_signal:number;curiosity_opportunity:number;requires_human_gate:boolean;reasons:string[]};
/** One kernel, multiple worlds. Domain labels do not alter epistemic math. */
export function projectDomain(xs:readonly DomainObservation[]):DomainProjection{
 if(!xs.length) throw new Error("domain_observations_required"); const domain=xs[0]!.domain;if(xs.some(x=>x.domain!==domain))throw new Error("mixed_domains_require_separate_projection");
 const turns:EpistemicTurn[]=xs.map(x=>({id:x.id,at_ms:x.at_ms,meaning_space_id:x.meaning_space_id,perspective:x.perspective,residual:x.residual,valence:x.valence,relation_refs:x.relation_refs,provenance_roots:x.provenance_roots}));
 const kpis=assessTrajectory(turns), latest=xs.at(-1)!; const corrective=Math.max(0,Math.min(1,latest.residual*latest.valence)); const curiosity=Math.max(0,Math.min(1,latest.residual*(1-latest.valence*.35)));
 const gate=latest.impact>=.7&&(kpis.e0_attention||latest.residual>=.5); const reasons=[kpis.classification,gate?"high_impact_epistemic_uncertainty":"bounded_observation"];
 return{domain,kpis,corrective_signal:corrective,curiosity_opportunity:curiosity,requires_human_gate:gate,reasons};
}
