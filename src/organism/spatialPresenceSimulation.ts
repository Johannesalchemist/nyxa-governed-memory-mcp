import { assessSpatialPresenceTrial, spatialPresenceAblation, type SpatialMedium, type SpatialPresenceTrial } from './spatialPresence.js';

export type SpatialSimCandidate={medium:SpatialMedium;density:number;distanceCm:number;headTracking:boolean};
export type SpatialSimResult={candidate:SpatialSimCandidate;trial:SpatialPresenceTrial;presenceScore:number;cost:number};

const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const profile:Record<SpatialMedium,{scatter:number;stability:number;visibility:number;latency:number;cost:number}>={
 DISPLAY:{scatter:.15,stability:1,visibility:0,latency:5,cost:.15},
 LED_ROTOR:{scatter:.65,stability:.9,visibility:.15,latency:12,cost:.35},
 PROJECTION:{scatter:.55,stability:.95,visibility:0,latency:10,cost:.4},
 HAZER:{scatter:.62,stability:.82,visibility:.22,latency:35,cost:.25},
 FOG:{scatter:.82,stability:.52,visibility:.7,latency:70,cost:.2},
 ULTRASONIC_MIST:{scatter:.72,stability:.76,visibility:.42,latency:45,cost:.22},
 DRY_ICE_FOG:{scatter:.88,stability:.4,visibility:.8,latency:90,cost:.3},
 SCENT_AEROSOL:{scatter:.58,stability:.68,visibility:.35,latency:55,cost:.32}
};

/** Synthetic wind tunnel only. Coefficients are hypotheses to rank physical tests, not measurements. */
export function simulateSpatialCandidate(c:SpatialSimCandidate):SpatialSimResult{
 const p=profile[c.medium]; const d=clamp(c.density); const range=clamp(1-Math.abs(c.distanceCm-30)/80);
 const tracking=c.headTracking?1:.72;
 const contrast=clamp(p.scatter*d*(.65+.35*range));
 const edgeSharpness=clamp(p.stability*(.45+.55*tracking)*(1-.25*d));
 const stability=clamp(p.stability*(.8+.2*range));
 const latencyMs=p.latency+(c.headTracking?8:0);
 const mediumVisibility=clamp(p.visibility*d);
 const emergenceDistanceCm=Math.max(0,c.distanceCm*contrast*tracking);
 const trial:SpatialPresenceTrial={medium:c.medium,mode:'SIMULATION_ONLY',liveEffects:false,authorityEffect:'NONE',
   emergenceDistanceCm,contrast,edgeSharpness,stability,latencyMs,mediumVisibility,aerosolMassMg:d*100};
 const gate=assessSpatialPresenceTrial(trial); if(!gate.eligible) throw new Error(gate.reasons.join(','));
 const presenceScore=contrast*.28+edgeSharpness*.24+stability*.2+clamp(emergenceDistanceCm/50)*.2+(1-mediumVisibility)*.08;
 return{candidate:c,trial,presenceScore,cost:p.cost+d*.1};
}

export function runSpatialAblation(){
 const densities=[.2,.4,.6,.8]; const distances=[10,30,50];
 const runs=spatialPresenceAblation.flatMap(m=>densities.flatMap(d=>distances.map(distanceCm=>simulateSpatialCandidate({medium:m,density:d,distanceCm,headTracking:true}))));
 const ranked=[...runs].sort((a,b)=>(b.presenceScore-b.cost*.12)-(a.presenceScore-a.cost*.12));
 return{runs,ranked,best:ranked[0],authorityEffect:'NONE' as const,liveEffects:false as const};
}

export function deriveSpatialLearning(results:readonly SpatialSimResult[]){
 if(!results.length)return{candidate:null,confidence:0,requiresPhysicalEvidence:true};
 const ranked=[...results].sort((a,b)=>b.presenceScore-a.presenceScore); const top=ranked[0]!;
 const same=results.filter(x=>x.candidate.medium===top.candidate.medium);
 const confidence=clamp(same.reduce((s,x)=>s+x.presenceScore,0)/same.length);
 return{candidate:{medium:top.candidate.medium,density:top.candidate.density,distanceCm:top.candidate.distanceCm},
   confidence,requiresPhysicalEvidence:true,authorityEffect:'NONE' as const};
}
