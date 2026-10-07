import type { KernelEffectEnvelope } from "./kernelContract.js";
export type KernelDispatchDecision={allowed:true}|{allowed:false;reason:"independent_verifier_required_pre_execution"};
export function kernelDispatchGate(envelope:KernelEffectEnvelope,independentVerifierBound=false):KernelDispatchDecision{
 if(envelope.verification==="independent"&&!independentVerifierBound)return{allowed:false,reason:"independent_verifier_required_pre_execution"};
 return{allowed:true};
}
export async function executeThroughKernelGate<T>(envelope:KernelEffectEnvelope,handler:()=>Promise<T>,independentVerifierBound=false):Promise<T>{
 const gate=kernelDispatchGate(envelope,independentVerifierBound);
 if(!gate.allowed)throw new Error(gate.reason);
 return handler();
}
