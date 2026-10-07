import type {MorphGenome} from "./morphologyGenome.js";
import {countCapability} from "./limbCapabilities.js";
export type StressScenario="STAIRS"|"RUBBLE"|"DOORWAY"|"PAYLOAD_30KG"|"WORK_2M"|"SIDE_LOAD"|"LOSE_WHEEL_LEG"|"LOSE_ARM"|"TAIL_BLOCKED"|"TORSO_JAMMED"|"TIP_RECOVERY";
export type StressResult={scenario:StressScenario;score:number;pass:boolean;reason:string};
const c=(x:number)=>Math.max(0,Math.min(1,x));
const regions=(g:MorphGenome,re:RegExp)=>new Set(g.nodes.filter(n=>n.kind==="STRUCTURE"&&re.test(n.region)).map(n=>n.region)).size;
export function stressTest(g:MorphGenome){
 const wheels=regions(g,/wheel_leg/i),arms=countCapability(g,"MANIPULATE"),supports=countCapability(g,"SUPPORT"),anchors=countCapability(g,"ANCHOR"),reaches=countCapability(g,"REACH"),selfRight=countCapability(g,"SELF_RIGHT"),tails=regions(g,/tail/i),spines=regions(g,/spine/i),shoulders=regions(g,/shoulder/i),dorsals=regions(g,/dorsal/i);
 const mass=g.nodes.reduce((a,n)=>a+n.massKg,0),act=g.nodes.filter(n=>n.kind==="ACTUATOR").reduce((a,n)=>a+n.capacity,0);
 const raw:[StressScenario,number,string][]=[
 ["STAIRS",c(wheels*.19+tails*.08),"articulated supports"],["RUBBLE",c(wheels*.18+tails*.12),"terrain contacts"],["DOORWAY",c(1-Math.max(0,wheels-4)*.12),"compact transit geometry"],
 ["PAYLOAD_30KG",c(act/(mass*16)),"actuation to loaded mass"],["WORK_2M",c(reaches*.24+spines*.28),"capability reach"],["SIDE_LOAD",c(supports*.13+anchors*.07),"support and anchor capability"],
 ["LOSE_WHEEL_LEG",c(Math.max(0,supports-1)*.16),"remaining support capability"],["LOSE_ARM",c(Math.max(0,arms-1)*.5+anchors*.04),"remaining manipulation capability"],
 ["TAIL_BLOCKED",c(wheels*.14+Math.max(0,supports-tails)*.08),"tail unavailable"],["TORSO_JAMMED",c(arms*.2+reaches*.12+shoulders*.1),"independent manipulation and reach"],["TIP_RECOVERY",c(selfRight*.15+anchors*.05),"self-right capability"]
 ];
 const results=raw.map(([scenario,score,reason])=>Object.freeze({scenario,score:+score.toFixed(4),pass:score>=.62,reason}));
 return Object.freeze({genomeId:g.id,results:Object.freeze(results),allPass:results.every(r=>r.pass),worst:+Math.min(...results.map(r=>r.score)).toFixed(4),mean:+(results.reduce((a,r)=>a+r.score,0)/results.length).toFixed(4),truthState:"SIMULATED" as const,authority:"none" as const});
}
