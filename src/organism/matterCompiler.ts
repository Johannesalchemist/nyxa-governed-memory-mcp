import { createHash } from 'node:crypto';
export type FabricationBackend='SIMULATION'|'RENDER_AR'|'ADDITIVE_3MF'|'ADDITIVE_STL'|'CNC_STEP'|'LASER_DXF'|'PCB_FAB'|'ASSEMBLY_PLAN'|'EXTERNAL_FAB';
export type MatterTruth='SPECIFIED'|'SIMULATED'|'BUILD_READY'|'PHYSICALLY_BUILT'|'MEASURED';
export type MatterSpec={id:string;requirements:Readonly<Record<string,string|number|boolean>>;geometryRef:string;lineageRefs:readonly string[];truth:MatterTruth;authority:'none'};
export type FabricationCapability={backend:FabricationBackend;available:boolean;verifiedAt:string|null;machineRef:string|null;constraints:Readonly<Record<string,string|number|boolean>>};
export type BuildPlan={specId:string;backend:FabricationBackend;artifactFormat:string;state:'SIMULATION_ONLY'|'BUILD_READY'|'EXTERNAL_FAB_REQUIRED';machineRef:string|null;authorityEffect:'NONE';reasons:readonly string[]};

export function buildMatterSpec(x:Omit<MatterSpec,'id'|'truth'|'authority'>):MatterSpec{
 if(!x.geometryRef.trim()||!x.lineageRefs.length)throw new Error('matter_spec_invalid');
 const material=JSON.stringify({requirements:x.requirements,geometryRef:x.geometryRef,lineageRefs:[...x.lineageRefs].sort()});
 return Object.freeze({...x,id:'matter_'+createHash('sha256').update(material).digest('hex').slice(0,24),truth:'SPECIFIED',authority:'none'});
}
const fmt:Record<FabricationBackend,string>={SIMULATION:'PARAMETRIC_MODEL',RENDER_AR:'GLTF',ADDITIVE_3MF:'3MF',ADDITIVE_STL:'STL',CNC_STEP:'STEP',LASER_DXF:'DXF',PCB_FAB:'GERBER',ASSEMBLY_PLAN:'BOM+DRAWINGS',EXTERNAL_FAB:'STEP+DRAWINGS'};
export function compileMatter(spec:MatterSpec,backend:FabricationBackend,caps:readonly FabricationCapability[]):BuildPlan{
 const reasons:string[]=[]; const cap=caps.find(c=>c.backend===backend);
 if(backend==='SIMULATION'||backend==='RENDER_AR')return{specId:spec.id,backend,artifactFormat:fmt[backend],state:'SIMULATION_ONLY',machineRef:null,authorityEffect:'NONE',reasons};
 if(!cap?.available||!cap.machineRef){reasons.push('fabrication_capability_not_verified');return{specId:spec.id,backend,artifactFormat:fmt[backend],state:'EXTERNAL_FAB_REQUIRED',machineRef:null,authorityEffect:'NONE',reasons};}
 if(!cap.verifiedAt||!Number.isFinite(Date.parse(cap.verifiedAt))){reasons.push('capability_verification_invalid');return{specId:spec.id,backend,artifactFormat:fmt[backend],state:'EXTERNAL_FAB_REQUIRED',machineRef:null,authorityEffect:'NONE',reasons};}
 return{specId:spec.id,backend,artifactFormat:fmt[backend],state:'BUILD_READY',machineRef:cap.machineRef,authorityEffect:'NONE',reasons};
}
export function recordPhysicalBuild(plan:BuildPlan,evidenceRefs:readonly string[]){
 if(plan.state!=='BUILD_READY'||!plan.machineRef)throw new Error('physical_build_without_verified_capability');
 if(!evidenceRefs.length)throw new Error('physical_build_evidence_missing');
 return{specId:plan.specId,backend:plan.backend,truth:'PHYSICALLY_BUILT' as const,machineRef:plan.machineRef,evidenceRefs:[...evidenceRefs],authorityEffect:'NONE' as const};
}
