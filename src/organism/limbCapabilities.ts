import type {MorphGenome} from "./morphologyGenome.js";
export type LimbCapability="MANIPULATE"|"SUPPORT"|"REACH"|"ANCHOR"|"SELF_RIGHT"|"SENSE";
export type FunctionalLimb={region:string;capabilities:readonly LimbCapability[]};
const caps=(region:string):readonly LimbCapability[]=>{
 if(/dorsal/i.test(region)) return ["MANIPULATE","SUPPORT","REACH","ANCHOR","SELF_RIGHT","SENSE"];
 if(/tail/i.test(region)) return ["SUPPORT","REACH","ANCHOR","SELF_RIGHT","SENSE"];
 if(/manip|arm/i.test(region)) return ["MANIPULATE","REACH","SENSE"];
 if(/wheel_leg|leg|support/i.test(region)) return ["SUPPORT","ANCHOR","SELF_RIGHT","SENSE"];
 if(/shoulder/i.test(region)) return ["REACH","SENSE"];
 return ["SENSE"];
};
export function functionalLimbs(g:MorphGenome):readonly FunctionalLimb[]{
 const rs=[...new Set(g.nodes.filter(n=>n.kind==="STRUCTURE").map(n=>n.region))];
 return Object.freeze(rs.map(region=>Object.freeze({region,capabilities:Object.freeze([...caps(region)])})));
}
export const countCapability=(g:MorphGenome,c:LimbCapability)=>functionalLimbs(g).filter(x=>x.capabilities.includes(c)).length;
