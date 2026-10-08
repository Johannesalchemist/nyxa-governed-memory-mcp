export const JEV_CANONICAL_MODEL={
 id:'StrandsAgents/strands-decider-2B-hobson-v21',
 revision:'2b52a6235c1b8306bbfa30b00b9d4b74b63a39f5',
 baseModel:'Qwen/Qwen3.5-2B-Base',
 role:'DECISION_MODEL',
 parametersB:1.9
} as const;
export const JEV_COMPARISON_MODELS=[{id:'qwen2.5-coder:7b',provider:'ollama',role:'COMPARISON_ONLY'}] as const;
export function assertCanonicalJevModel(id:string,revision:string){
 if(id!==JEV_CANONICAL_MODEL.id)throw new Error('jev_model_identity_mismatch');
 if(revision!==JEV_CANONICAL_MODEL.revision)throw new Error('jev_model_revision_mismatch');
 return JEV_CANONICAL_MODEL;
}
export function jevModelPassport(){return{...JEV_CANONICAL_MODEL,authorityEffect:'NONE' as const,comparisonModels:JEV_COMPARISON_MODELS};}
