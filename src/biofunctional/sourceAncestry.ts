export type SourceNode={id:string;kind:"source"|"provider"|"transform"|"model";rootCluster:string|"UNKNOWN"};
export type ResidualPair={a:string;b:string;correlation:number};
export function effectiveIndependence(nodes:readonly SourceNode[],residuals:readonly ResidualPair[]){
 if(!nodes.length)return{n:0,rootClusters:0,meanCorrelation:1,nEff:0};
 const roots=new Set(nodes.map(n=>n.rootCluster==="UNKNOWN"?"UNKNOWN_SHARED":n.rootCluster));let sum=0,count=0;
 for(const r of residuals){if(!Number.isFinite(r.correlation)||r.correlation<-1||r.correlation>1)throw new Error("ancestry_correlation_invalid");sum+=Math.max(0,r.correlation);count++;}
 const rho=count?sum/count:0;const n=nodes.length;const corrEff=n/(1+(n-1)*rho);return{n,rootClusters:roots.size,meanCorrelation:rho,nEff:Math.min(roots.size,corrEff)};
}
