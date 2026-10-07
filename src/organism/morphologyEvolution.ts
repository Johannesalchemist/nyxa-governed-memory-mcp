import {baselineHumanH0,buildMorphologyCandidate,simulateHomeostasis,morphologyFitness,type BodyNode,type MorphologyCandidate,type MorphologyMode,type Scenario} from "./morphologyHomeostasis.js";
export type EvolutionResult={mode:MorphologyMode;generations:number;winner:MorphologyCandidate;score:number;evaluations:readonly {scenarioId:string;peakTempC:number;safeTouch:boolean;score:number}[]};
const clone=(n:readonly BodyNode[])=>n.map(x=>({...x}));
function mutate(base:MorphologyCandidate,mode:MorphologyMode,g:number,k:number):MorphologyCandidate{
 const nodes=clone(base.nodes);const scale=1+(((g*17+k*31)%11)-5)/100;
 for(let i=0;i<nodes.length;i++){const n=nodes[i]!;const phase=((g+1)*(i+3)*(k+2))%9;
  n.computeW=Math.max(0,n.computeW*(phase%3===0?1.04:phase%3===1?.98:1));
  n.coolantCapacityW=Math.max(0,n.coolantCapacityW*(phase%2===0?1.05:.99));
  n.thermalAreaM2=Math.max(.01,n.thermalAreaM2*(mode==="H0_HUMAN"?1:scale));
  if(mode!=="H0_HUMAN")n.massKg=Math.max(.2,n.massKg*(phase%2===0?.985:1.005));
 }
 const conformity=mode==="H0_HUMAN"?1:mode==="H1_BIO_INSPIRED"?.85:0;
 return buildMorphologyCandidate({mode,generation:g,humanConformity:conformity,nodes,provenanceRefs:[base.id,"bounded-evolution:v0"]});
}
function aggregate(c:MorphologyCandidate,scenarios:readonly Scenario[]){const es=scenarios.map(s=>simulateHomeostasis(c,s));const scores=es.map(e=>morphologyFitness(e,c.mode));const unsafe=es.some(e=>!e.metrics.safeTouch);const compute=c.nodes.reduce((a,n)=>a+n.computeW,0),cooling=c.nodes.reduce((a,n)=>a+n.coolantCapacityW,0),area=c.nodes.reduce((a,n)=>a+n.thermalAreaM2,0);const overBudget=compute>900||cooling>1200||area>3.5;const resourcePenalty=compute*.03+cooling*.02+area*2;return{score:unsafe||overBudget?-1e6:Number((scores.reduce((a,b)=>a+b,0)/scores.length-resourcePenalty).toFixed(6)),evaluations:es.map((e,i)=>({scenarioId:e.scenarioId,peakTempC:e.metrics.peakTempC,safeTouch:e.metrics.safeTouch,score:scores.at(i) ?? 0}))};}
export function evolveMorphology(mode:MorphologyMode,scenarios:readonly Scenario[],generations=12,population=8):EvolutionResult{
 if(!scenarios.length||generations<1||population<2||generations>100||population>64)throw new Error("morphology_evolution_bounds");
 const h0=baselineHumanH0();let incumbent=mode==="H0_HUMAN"?h0:buildMorphologyCandidate({mode,generation:0,humanConformity:mode==="H1_BIO_INSPIRED"?.85:0,nodes:h0.nodes,provenanceRefs:[h0.id,"mode-release:v0"]});
 let best=aggregate(incumbent,scenarios);
 for(let g=1;g<=generations;g++){for(let k=0;k<population;k++){const c=mutate(incumbent,mode,g,k),a=aggregate(c,scenarios);if(a.score>best.score){incumbent=c;best=a;}}}
 return Object.freeze({mode,generations,winner:incumbent,score:best.score,evaluations:Object.freeze(best.evaluations.map(x=>Object.freeze({...x})))});
}
