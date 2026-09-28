export type EpistemicTurn={id:string;at_ms:number;meaning_space_id:string;perspective:string;residual:number;valence:number;relation_refs:string[];provenance_roots:string[]};
export type TrajectoryKpis={recursion_frequency_hz:number;oscillation:number;dimensional_gain:number;integration_lag_ms:number;independent_provenance_gain:number;classification:"STAGNANT_LOOP"|"SPIRAL_LEARNING"|"BOUNDARY_REVISION"|"DYNAMIC_STABILITY"|"INSUFFICIENT_DATA";e0_attention:boolean;reasons:string[]};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const flips=(xs:number[])=>{let n=0;for(let i=2;i<xs.length;i++){const a=xs[i-1]!-xs[i-2]!,b=xs[i]!-xs[i-1]!;if(a*b<0)n++;}return n};
/** Describes trajectory shape only. Geometry is a diagnostic projection, never truth/evidence. */
export function assessTrajectory(turns:readonly EpistemicTurn[]):TrajectoryKpis{
 if(turns.length<2)return {recursion_frequency_hz:0,oscillation:0,dimensional_gain:0,integration_lag_ms:0,independent_provenance_gain:0,classification:"INSUFFICIENT_DATA",e0_attention:false,reasons:["need_multiple_turns"]};
 const xs=[...turns].sort((a,b)=>a.at_ms-b.at_ms); const dt=Math.max(1,xs.at(-1)!.at_ms-xs[0]!.at_ms); const freq=(xs.length-1)/(dt/1000);
 const rs=xs.map(x=>clamp(x.residual)); const osc=rs.length<3?0:flips(rs)/Math.max(1,rs.length-2);
 const firstR=new Set(xs[0]!.relation_refs), lastR=new Set(xs.at(-1)!.relation_refs); const firstP=new Set(xs[0]!.perspective.split("|")), lastP=new Set(xs.at(-1)!.perspective.split("|"));
 const gain=[...lastR].filter(x=>!firstR.has(x)).length+[...lastP].filter(x=>!firstP.has(x)).length; const denom=Math.max(1,firstR.size+firstP.size); const dimensional= gain/denom;
 const p0=new Set(xs[0]!.provenance_roots), all=new Set(xs.flatMap(x=>x.provenance_roots)); const provenanceGain=[...all].filter(x=>!p0.has(x)).length;
 let lag=dt; for(let i=1;i<xs.length;i++)if(xs[i]!.relation_refs.some(r=>!firstR.has(r))||xs[i]!.perspective!==xs[0]!.perspective){lag=xs[i]!.at_ms-xs[0]!.at_ms;break;}
 const sameMeaning=xs.every(x=>x.meaning_space_id===xs[0]!.meaning_space_id); const boundaryRevision=dimensional>0&&xs.some(x=>x.perspective!==xs[0]!.perspective);
 let classification:TrajectoryKpis["classification"]="DYNAMIC_STABILITY"; const reasons:string[]=[];
 if(sameMeaning&&dimensional===0&&provenanceGain===0){classification="STAGNANT_LOOP";reasons.push("recursion_without_new_dimension_or_provenance");}
 else if(boundaryRevision){classification="BOUNDARY_REVISION";reasons.push("perspective_boundary_changed");}
 else if(dimensional>0){classification="SPIRAL_LEARNING";reasons.push("recursion_with_dimensional_gain");}
 else reasons.push("bounded_change_without_dimension_gain");
 const recentIntervals=xs.slice(1).map((x,i)=>x.at_ms-xs[i]!.at_ms); const fastestInterval=Math.max(1,Math.min(...recentIntervals)); const peakFreq=1000/fastestInterval; const e0=classification==="STAGNANT_LOOP"||(peakFreq>0&&lag>0&&(peakFreq*(lag/1000)>3)); if(e0)reasons.push("recursion_outpaces_integration_or_stagnates");
 return {recursion_frequency_hz:freq,oscillation:osc,dimensional_gain:dimensional,integration_lag_ms:lag,independent_provenance_gain:provenanceGain,classification,e0_attention:e0,reasons};
}
