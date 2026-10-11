/** Advisory JEV dream selection; execution always requires a governed proposal. */
export type DreamMode = 'SUMMARY' | 'REFLECTION';
export type DreamFeedback = {mode:DreamMode;verifiedGain:number;cost:number;independent:boolean};
export function selectDreamMode(input:{events:number;budget:number;modelAvailable:boolean},history:readonly DreamFeedback[]):{mode:DreamMode|null;authorityEffect:'NONE';requiresGovernance:true}{
 const blocked=!Number.isSafeInteger(input.events)||input.events<=0||!Number.isFinite(input.budget)||input.budget<1;
 if(blocked)return{mode:null,authorityEffect:'NONE',requiresGovernance:true};
 const eligible=history.filter(x=>x.independent&&Number.isFinite(x.verifiedGain)&&Number.isFinite(x.cost)&&x.cost>=0);
 const utility=(mode:DreamMode)=>{const xs=eligible.filter(x=>x.mode===mode);return xs.length?xs.reduce((n,x)=>n+x.verifiedGain-x.cost,0)/xs.length:0};
 const mode=input.modelAvailable&&utility('REFLECTION')>utility('SUMMARY')?'REFLECTION':'SUMMARY';
 return{mode,authorityEffect:'NONE',requiresGovernance:true};
}
