import type { CausalEdge } from "./types.js";
export type RippleImpact={decision:"HUMAN_GATE"|"NO_PROPAGATION";blast_radius:number;energy_joules:number;simulation_reality_delta:number;reasons:string[]};
/** Any immediate causal ripple into a real/production state is proposal-only and requires Human Authority. */
export function assessRippleImpact(edge:CausalEdge, affectedEntities:readonly string[], energyJoules:number, simulationRealityDelta:number):RippleImpact {
 const causal=edge.status==="CAUSAL_EVIDENCE"||edge.status==="CAUSAL_SUPPORT"; if(!causal) return {decision:"NO_PROPAGATION",blast_radius:0,energy_joules:0,simulation_reality_delta:0,reasons:["non_causal_edge"]};
 return {decision:"HUMAN_GATE",blast_radius:new Set(affectedEntities).size,energy_joules:Math.max(0,energyJoules),simulation_reality_delta:Math.max(0,simulationRealityDelta),reasons:["immediate_ripple_requires_human_gate"]};
}
