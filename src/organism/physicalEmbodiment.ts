import type {MorphGenome} from "./morphologyGenome.js";
export type PhysicalTaskResult={task:string;pass:boolean;score:number;detail:string};
export type PhysicalEvaluation={genomeId:string;allPass:boolean;score:number;results:readonly PhysicalTaskResult[];truthState:"SIMULATED";authority:"none"};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const regions=(g:MorphGenome,re:RegExp)=>new Set(g.nodes.filter(n=>re.test(n.region)).map(n=>n.region));
const nkind=(g:MorphGenome,k:string)=>g.nodes.filter(n=>n.kind===k).length;
export function evaluatePhysicalTasks(g:MorphGenome):PhysicalEvaluation{
 const legs=regions(g,/(leg|wheel|track|support|foot)/i).size,manipulators=regions(g,/(arm|hand|manip|gripper|tentacle)/i).size;
 const supports=Math.max(legs,regions(g,/(support|wheel|track)/i).size),actuators=nkind(g,"ACTUATOR"),sensors=nkind(g,"SENSOR");
 const mass=g.nodes.reduce((a,n)=>a+n.massKg,0);
 const locomotion=clamp((supports*.32+actuators*.035)-Math.max(0,mass-80)*.004);
 const balance=clamp(supports>=3?.95:supports===2?.78:supports===1?.45:0);
 const reach=clamp(manipulators*.46+actuators*.025);
 const payload=clamp((actuators*18)/(Math.max(1,mass)*2.2));
 const sensing=clamp(sensors*.18+g.nodes.filter(n=>n.kind==="COMPUTE").length*.04);
 const oneSupportLost=Math.max(0,supports-1),supportFailure=clamp(oneSupportLost>=3?.9:oneSupportLost===2?.82:oneSupportLost===1?.58:0);
 const oneManipulatorLost=Math.max(0,manipulators-1),manipulationFailure=clamp(oneManipulatorLost*.55+actuators*.02);
 const raw:[string,number,number,string][]=[
  ["walk_and_reposition",locomotion,.65,String(supports)+" support regions"],["static_balance",balance,.65,String(supports)+" support regions"],
  ["reach_workspace",reach,.65,String(manipulators)+" manipulator regions"],["carry_payload",payload,.55,mass.toFixed(1)+"kg body mass"],
  ["sensor_coverage",sensing,.65,String(sensors)+" sensor nodes"],["support_failure",supportFailure,.55,String(oneSupportLost)+" supports after failure"],
  ["manipulator_failure",manipulationFailure,.45,String(oneManipulatorLost)+" manipulators after failure"]
 ];
 const results=raw.map(([task,score,min,detail])=>Object.freeze({task,pass:score>=min,score:Number(score.toFixed(4)),detail}));
 return Object.freeze({genomeId:g.id,allPass:results.every(r=>r.pass),score:Number((results.reduce((a,r)=>a+r.score,0)/results.length).toFixed(4)),results:Object.freeze(results),truthState:"SIMULATED",authority:"none"});
}
