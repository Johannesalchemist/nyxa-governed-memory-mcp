import {buildMorphGenome,type MorphGenome,type MorphNode,type MorphEdge} from "./morphologyGenome.js";
export type AdaptivePrimitive="WHEEL_LEG"|"TELESCOPIC_SPINE"|"TELESCOPIC_MANIPULATOR"|"MULTIROLE_TAIL"|"ARTICULATED_SHOULDER"|"DORSAL_OMNI_MANIPULATOR";
const add=(nodes:MorphNode[],edges:MorphEdge[],kind:AdaptivePrimitive,index:number)=>{
 const r=(kind==="WHEEL_LEG"?"wheel_leg_":kind==="TELESCOPIC_MANIPULATOR"?"manip_":kind==="MULTIROLE_TAIL"?"tail_":kind==="ARTICULATED_SHOULDER"?"shoulder_":kind==="DORSAL_OMNI_MANIPULATOR"?"dorsal_":"spine_")+index;
 const spec=kind==="WHEEL_LEG"?{mass:4.4,act:150,area:.1}:kind==="TELESCOPIC_MANIPULATOR"?{mass:3.0,act:125,area:.08}:kind==="MULTIROLE_TAIL"?{mass:3.4,act:135,area:.09}:kind==="ARTICULATED_SHOULDER"?{mass:1.8,act:90,area:.05}:kind==="DORSAL_OMNI_MANIPULATOR"?{mass:4.6,act:175,area:.11}:{mass:2.5,act:100,area:.07};
 const sid="s_"+r,aid="a_"+r,qid="q_"+r;
 nodes.push({id:sid,kind:"STRUCTURE",region:r,massKg:spec.mass,capacity:kind==="TELESCOPIC_SPINE"?1.8:1,areaM2:spec.area},{id:aid,kind:"ACTUATOR",region:r,massKg:.9,capacity:spec.act,areaM2:.02},{id:qid,kind:"SENSOR",region:r,massKg:.12,capacity:40,areaM2:.02});
 edges.push({a:"core",b:sid,kind:"MECHANICAL",capacity:1},{a:"core",b:aid,kind:"POWER",capacity:spec.act},{a:"core",b:qid,kind:"DATA",capacity:40});
};
export function adaptiveBody(base:MorphGenome,primitives:readonly AdaptivePrimitive[],neutral=false):MorphGenome{
 const keep=neutral?new Set(["core","energy","skin","s_torso","c_torso","t_torso","a_torso","q_torso"]):null;
 const nodes:MorphNode[]=base.nodes.filter(n=>!keep||keep.has(n.id)).map(n=>({...n}));
 const ids=new Set(nodes.map(n=>n.id)),edges:MorphEdge[]=base.edges.filter(e=>ids.has(e.a)&&ids.has(e.b)).map(e=>({...e}));
 for(let i=0;i<primitives.length;i++)add(nodes,edges,primitives[i]!,i);
 return buildMorphGenome({mode:"H2_FREE",generation:base.generation+1,humanConformity:0,nodes,edges,lineageRefs:[base.id,neutral?"neutral-adaptive:v1":"adaptive-primitives:v1"]});
}
