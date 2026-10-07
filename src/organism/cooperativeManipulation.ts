import type {MorphGenome} from "./morphologyGenome.js";
import {countCapability} from "./limbCapabilities.js";
export type CooperativeTask="HOLD_AND_TOOL"|"CABLE_AND_CONNECTOR"|"COUNTERHOLD_VALVE"|"WORK_WHILE_ANCHORED"|"THREE_POINT_ASSEMBLY";
export function cooperativeManipulation(g:MorphGenome){
 const m=countCapability(g,"MANIPULATE"),s=countCapability(g,"SUPPORT"),a=countCapability(g,"ANCHOR"),r=countCapability(g,"REACH");
 const tasks=[
  {task:"HOLD_AND_TOOL" as const,score:Math.min(1,m/2),pass:m>=2},
  {task:"CABLE_AND_CONNECTOR" as const,score:Math.min(1,Math.min(m/2,r/2)),pass:m>=2&&r>=2},
  {task:"COUNTERHOLD_VALVE" as const,score:Math.min(1,m/2),pass:m>=2},
  {task:"WORK_WHILE_ANCHORED" as const,score:Math.min(1,(m>=2?0.7:0)+(a>=1?0.3:0)),pass:m>=2&&a>=1},
  {task:"THREE_POINT_ASSEMBLY" as const,score:Math.min(1,m/3),pass:m>=3}
 ];
 const mandatory=tasks.slice(0,4),bonus=tasks[4]!.pass?.12:0;
 return Object.freeze({manipulators:m,supports:s,anchors:a,reaches:r,tasks:Object.freeze(tasks),mandatoryPass:mandatory.every(x=>x.pass),bimanualPass:m>=2,trimanualBonus:bonus,total:+Math.min(1,mandatory.reduce((x,y)=>x+y.score,0)/mandatory.length+bonus).toFixed(4),truthState:"SIMULATED" as const,authority:"none" as const});
}
