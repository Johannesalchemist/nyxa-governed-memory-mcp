import type { ResearchProvider, ResearchRequest, ResearchFinding } from './researchAgent.js';

export type ResearchRoute='LOCAL_JEV'|'EXTERNAL_RESEARCH'|'INDEPENDENT_CHECK';
export type ResearchProviderEntry={id:string;provider:ResearchProvider;external:boolean;modelVersion?:string;modelId?:string;providerIdentity?:string};
export type ResearchRouterPolicy={jevProviderId:string;externalProviderIds:string[]};

/** Provider selection only. It never grants authority and never interprets findings as actions. */
export class ResearchProviderRegistry {
  private readonly entries=new Map<string,ResearchProviderEntry>();
  constructor(private readonly policy:ResearchRouterPolicy){}
  register(entry:ResearchProviderEntry){
    if(!entry.id.trim())throw new Error('research_provider_id_required');
    if(this.entries.has(entry.id))throw new Error('research_provider_duplicate_id');
    this.entries.set(entry.id,entry);return this;
  }
  describe(){return [...this.entries.values()].map(({id,external,modelVersion})=>({id,external,modelVersion:modelVersion??null}));}
  select(route:ResearchRoute):ResearchProviderEntry[] {
    const ids=route==='LOCAL_JEV'?[this.policy.jevProviderId]:this.policy.externalProviderIds;
    const selected=ids.map(id=>this.entries.get(id)).filter((x):x is ResearchProviderEntry=>Boolean(x));
    if(selected.length!==ids.length)throw new Error('research_provider_unavailable');
    if(route!=='INDEPENDENT_CHECK')return selected.slice(0,1);
    // One OpenRouter transport can serve many model providers. Identity must be
    // explicit and distinct, never inferred from the adapter/transport name.
    const unique=new Map<string,ResearchProviderEntry>();
    for(const entry of selected){
      if(!entry.external || !entry.providerIdentity?.trim() || !entry.modelId?.trim())continue;
      const identity=entry.providerIdentity.trim().toLowerCase();
      if(!unique.has(identity))unique.set(identity,entry);
    }
    if(unique.size<2)throw new Error('independent_check_provider_diversity_unverified');
    return [...unique.values()].slice(0,2);
  }
}

export class RoutedResearchProvider implements ResearchProvider {
  constructor(private readonly registry:ResearchProviderRegistry,private readonly route:ResearchRoute){}
  async research(request:ResearchRequest):Promise<ResearchFinding>{
    const providers=this.registry.select(this.route);
    const findings=await Promise.all(providers.map(x=>x.provider.research(request)));
    // Model-provider diversity is distinct from source diversity. Never silently
    // promote shared, missing or opaque citations to independent corroboration.
    const sourceSets=findings.map(f=>new Set(f.provenance_refs.filter(ref=>ref.trim())));
    const sourceDiversityVerified=this.route==='INDEPENDENT_CHECK' &&
      sourceSets.length>=2 && sourceSets.every(set=>set.size>0) &&
      [...(sourceSets[0] ?? new Set<string>())].some(ref=>!(sourceSets[1] ?? new Set<string>()).has(ref)) &&
      [...(sourceSets[1] ?? new Set<string>())].some(ref=>!(sourceSets[0] ?? new Set<string>()).has(ref));
    const usages=findings.map(f=>f.tool_calls_used);
    const valid=usages.every(n=>n!==undefined&&Number.isSafeInteger(n)&&n>=0);
    const total=valid?usages.reduce<number>((sum,n)=>sum+(n??0),0):undefined;
    const flat=(k:keyof ResearchFinding)=>findings.flatMap(f=>Array.isArray(f[k])?f[k] as string[]:[]);
    return {
      supporting_evidence:flat('supporting_evidence'),disconfirming_evidence:flat('disconfirming_evidence'),
      alternative_hypotheses:flat('alternative_hypotheses'),missing_observables:flat('missing_observables'),
      provenance_refs:flat('provenance_refs'),contradictions:flat('contradictions'),
      ...(total!==undefined&&Number.isSafeInteger(total)?{tool_calls_used:total}:{}),
      ...(this.route==='INDEPENDENT_CHECK'?{
        verification:{
          model_provider_diversity:'configured_distinct' as const,
          source_diversity:sourceDiversityVerified?'distinct_refs_unverified' as const:'not_established' as const,
          independent_source_validation:false,
          providers:providers.map(p=>({id:p.id,providerIdentity:p.providerIdentity!,modelId:p.modelId!}))
        }
      }:{}),
      requires_human_input:findings.some(f=>f.requires_human_input===true)
    };
  }
}
