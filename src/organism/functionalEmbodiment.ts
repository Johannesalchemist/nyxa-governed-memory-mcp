import type {MorphGenome,MorphNode} from "./morphologyGenome.js";
export type EmbodimentTask="LOCOMOTION"|"MANIPULATION"|"BALANCE"|"SENSING"|"THERMAL_SURVIVAL"|"RECOVERY";
export type FunctionalProfile={task:EmbodimentTask;score:number;pass:boolean;reasons:readonly string[]};
export type EmbodimentEvaluation={version:"nyxa.embodiment.v1";genomeId:string;profiles:readonly FunctionalProfile[];allRequiredPass:boolean;authority:"none";truthState:"SIMULATED"};
const count=(g:MorphGenome,k:MorphNode["kind"])=>g.nodes.filter(n=>n.kind===k).length;
const cap=(g:MorphGenome,k:MorphNode["kind"])=>g.nodes.filter(n=>n.kind===k).reduce((a,n)=>a+n.capacity,0);
const degree=(g:MorphGenome,id:string)=>g.edges.filter(e=>e.a===id||e.b===id).length;
const bounded=(x:number)=>Math.max(0,Math.min(1,x));
export function evaluateEmbodiment(g:MorphGenome):EmbodimentEvaluation{
 const structures=g.nodes.filter(n=>n.kind==="STRUCTURE"),supported=new Set(structures.map(n=>n.region)),orphaned=g.nodes.filter(n=>["ACTUATOR","SENSOR","COMPUTE","THERMAL"].includes(n.kind)&&!supported.has(n.region)&&!n.region.startsWith("free_")&&n.region!=="torso"),actuators=count(g,"ACTUATOR"),sensors=count(g,"SENSOR"),thermal=cap(g,"THERMAL")+cap(g,"SURFACE"),compute=cap(g,"COMPUTE");
 const appendicular=structures.filter(n=>/(arm|leg|limb|appendage|free)/i.test(n.region)).length;
 const branching=g.nodes.filter(n=>degree(g,n.id)>=3).length;
 const locomotion=bounded((appendicular+actuators*1.5)/4);
 const manipulation=bounded((structures.filter(n=>/(arm|hand|manip|appendage|free)/i.test(n.region)).length+actuators*2)/3);
 const balance=bounded((structures.length+branching*.5)/6);
 const sensing=bounded((sensors*2+compute/450)/2);
 const thermalSurvival=bounded(thermal/1500);
 const recovery=bounded((branching+thermal/900+compute/700)/4);
 const raw:[EmbodimentTask,number,string][]=[
  ["LOCOMOTION",locomotion,"requires locomotor structure or actuator replacement"],
  ["MANIPULATION",manipulation,"requires manipulator structure or actuator replacement"],
  ["BALANCE",balance,"requires distributed support and topology"],
  ["SENSING",sensing,"requires sensor coverage or sufficient distributed compute proxy"],
  ["THERMAL_SURVIVAL",thermalSurvival,"requires thermal rejection capacity"],
  ["RECOVERY",recovery,"requires redundancy and reroutable topology"]
 ];
 const profiles=raw.map(([task,score,reason])=>Object.freeze({task,score:Number(score.toFixed(4)),pass:score>=.65,reasons:Object.freeze(score>=.65?[]:[reason])}));
 return Object.freeze({version:"nyxa.embodiment.v1",genomeId:g.id,profiles:Object.freeze(profiles),allRequiredPass:orphaned.length===0&&profiles.every(p=>p.pass),authority:"none",truthState:"SIMULATED"});
}
