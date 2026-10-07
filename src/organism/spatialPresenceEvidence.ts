import type { SpatialMedium, SpatialPresenceTrial } from './spatialPresence.js';

export type PhysicalEvidence={id:string;medium:SpatialMedium;capturedAt:string;deviceRef:string;operatorRef:string;
 trial:SpatialPresenceTrial;ambient:{lux:number;temperatureC:number;humidityPct:number};source:'OBSERVED_REALITY';};
export type Calibration={medium:SpatialMedium;n:number;mae:{contrast:number;edgeSharpness:number;stability:number;latencyMs:number;mediumVisibility:number};eligible:boolean;reasons:string[]};

const finite=(n:number)=>Number.isFinite(n);
export function validatePhysicalEvidence(e:PhysicalEvidence){
 const reasons:string[]=[];
 if(!e.id.trim())reasons.push('evidence_id_missing');
 if(!e.deviceRef.trim())reasons.push('device_ref_missing');
 if(!e.operatorRef.trim())reasons.push('operator_ref_missing');
 if(e.source!=='OBSERVED_REALITY')reasons.push('source_not_observed_reality');
 if(e.trial.medium!==e.medium)reasons.push('medium_mismatch');
 if(e.trial.liveEffects!==false||e.trial.authorityEffect!=='NONE')reasons.push('governance_boundary_invalid');
 if(!Number.isFinite(Date.parse(e.capturedAt)))reasons.push('timestamp_invalid');
 if([e.ambient.lux,e.ambient.temperatureC,e.ambient.humidityPct].some(x=>!finite(x)))reasons.push('ambient_invalid');
 return{accepted:reasons.length===0,reasons,authorityEffect:'NONE' as const};
}

export function calibrateFromPairs(pairs:readonly {predicted:SpatialPresenceTrial;observed:PhysicalEvidence}[]):Calibration[]{
 const groups=new Map<SpatialMedium,typeof pairs>();
 for(const p of pairs){if(!validatePhysicalEvidence(p.observed).accepted||p.predicted.medium!==p.observed.medium)continue;
  groups.set(p.predicted.medium,[...(groups.get(p.predicted.medium)??[]),p]);}
 return [...groups].map(([medium,xs])=>{
  const avg=(f:(p:(typeof xs)[number])=>number)=>xs.reduce((s,p)=>s+f(p),0)/xs.length;
  const mae={contrast:avg(p=>Math.abs(p.predicted.contrast-p.observed.trial.contrast)),
   edgeSharpness:avg(p=>Math.abs(p.predicted.edgeSharpness-p.observed.trial.edgeSharpness)),
   stability:avg(p=>Math.abs(p.predicted.stability-p.observed.trial.stability)),
   latencyMs:avg(p=>Math.abs(p.predicted.latencyMs-p.observed.trial.latencyMs)),
   mediumVisibility:avg(p=>Math.abs(p.predicted.mediumVisibility-p.observed.trial.mediumVisibility))};
  const reasons:string[]=[]; if(xs.length<3)reasons.push('insufficient_independent_observations');
  if(mae.contrast>.2||mae.edgeSharpness>.2||mae.stability>.2||mae.mediumVisibility>.2)reasons.push('model_error_high');
  return{medium,n:xs.length,mae,eligible:reasons.length===0,reasons};
 });
}

export const physicalBenchProtocol={
 candidates:['HAZER','ULTRASONIC_MIST'] as SpatialMedium[],
 distancesCm:[10,30,50], densities:[.2,.4,.6,.8],
 repetitions:3, requiredEvidence:['deviceRef','operatorRef','timestamp','ambient','trialMetrics'],
 promotion:'CALIBRATION_ONLY', autonomousLiveActivation:false, authorityEffect:'NONE'
} as const;
