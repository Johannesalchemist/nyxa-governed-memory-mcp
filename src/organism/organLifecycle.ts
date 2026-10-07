export function canActivateOrgan(x:{shadow:boolean;liveEdges:number;humanRatified:boolean;influenceBudget:number}){return x.shadow&&x.liveEdges===0&&x.humanRatified&&x.influenceBudget>0;}
export function canRetireOrgan(x:{freshEvidence:boolean;liveDependents:number;shadowAblationDone:boolean;tombstoneReady:boolean}){return x.freshEvidence&&x.liveDependents===0&&x.shadowAblationDone&&x.tombstoneReady;}
export function monocultureSignal(x:{modelAncestryRoots:number;agents:number;meanErrorCorrelation:number}){return x.agents>=2&&(x.modelAncestryRoots<=1||x.meanErrorCorrelation>=.8);}
