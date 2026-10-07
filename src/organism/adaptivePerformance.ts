import type {MorphGenome} from "./morphologyGenome.js";
export type AdaptivePerformance={mobility:number;terrain:number;workEnvelope:number;payload:number;stability:number;failureTolerance:number;compactness:number;total:number;pass:boolean};
const c=(x:number)=>Math.max(0,Math.min(1,x));
const count=(g:MorphGenome,re:RegExp)=>new Set(g.nodes.filter(n=>re.test(n.region)&&n.kind==="STRUCTURE").map(n=>n.region)).size;
export function evaluateAdaptivePerformance(g:MorphGenome):AdaptivePerformance{
 const wheels=count(g,/wheel_leg/i),legs=count(g,/(left_leg|right_leg|wheel_leg|support)/i),manips=count(g,/(left_arm|right_arm|manip|tail)/i),tails=count(g,/tail/i),spines=count(g,/spine/i);
 const mass=g.nodes.reduce((a,n)=>a+n.massKg,0),act=g.nodes.filter(n=>n.kind==="ACTUATOR").reduce((a,n)=>a+n.capacity,0);
 const mobility=c(wheels*.19+legs*.13+act/5000),terrain=c(legs*.14+wheels*.1+tails*.12),workEnvelope=c(manips*.22+spines*.25),payload=c(act/(mass*18)),stability=c(legs*.16+tails*.24),failureTolerance=c(Math.max(0,legs-1)*.18+Math.max(0,manips-1)*.14+tails*.12),compactness=c(1-Math.max(0,mass-70)/55);
 const total=.16*mobility+.14*terrain+.18*workEnvelope+.14*payload+.16*stability+.14*failureTolerance+.08*compactness;
 return Object.freeze({mobility:+mobility.toFixed(4),terrain:+terrain.toFixed(4),workEnvelope:+workEnvelope.toFixed(4),payload:+payload.toFixed(4),stability:+stability.toFixed(4),failureTolerance:+failureTolerance.toFixed(4),compactness:+compactness.toFixed(4),total:+total.toFixed(4),pass:mobility>=.65&&terrain>=.6&&workEnvelope>=.65&&stability>=.65&&failureTolerance>=.5});
}
