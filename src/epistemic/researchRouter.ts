import type { ResearchProvider, ResearchRequest, ResearchFinding } from './researchAgent.js';

export type ResearchRoute='LOCAL_JEV'|'EXTERNAL_RESEARCH'|'INDEPENDENT_CHECK';
export type ResearchProviderEntry={id:string;provider:ResearchProvider;external:boolean;modelVersion?:string};
export type ResearchRouterPolicy={jevProviderId:string;externalProviderIds:string[]};

/** Provider selection only. It never grants authority and never interprets findings as actions. */
export class ResearchProviderRegistry {
  private readonly entries=new Map<string,ResearchProviderEntry>();
  constructor(private readonly policy:ResearchRouterPolicy){}
  register(entry:ResearchProviderEntry){if(!entry.id.trim())throw new Error('research_provider_id_required');this.entries.set(entry.id,entry);return this;}
  describe(){return [...this.entries.values()].map(({id,external,modelVersion})=>({id,external,modelVersion:modelVersion??null}));}
  select(route:ResearchRoute):ResearchProviderEntry[] {
    const ids=route==='LOCAL_JEV'?[this.policy.jevProviderId]:this.policy.externalProviderIds;
    const selected=ids.map(id=>this.entries.get(id)).filter((x):x is ResearchProviderEntry=>Boolean(x));
    if(selected.length!==ids.length)throw new Error('research_provider_unavailable');
    return route==='INDEPENDENT_CHECK'?selected.slice(0,2):selected.slice(0,1);
  }
}

export class RoutedResearchProvider implements ResearchProvider {
  constructor(private readonly registry:ResearchProviderRegistry,private readonly route:ResearchRoute){}
  async research(request:ResearchRequest):Promise<ResearchFinding>{
    const providers=this.registry.select(this.route);
    const findings=await Promise.all(providers.map(x=>x.provider.research(request)));
    const flat=(k:keyof ResearchFinding)=>findings.flatMap(f=>Array.isArray(f[k])?f[k] as string[]:[]);
    return {
      supporting_evidence:flat('supporting_evidence'),disconfirming_evidence:flat('disconfirming_evidence'),
      alternative_hypotheses:flat('alternative_hypotheses'),missing_observables:flat('missing_observables'),
      provenance_refs:flat('provenance_refs'),contradictions:flat('contradictions'),
      requires_human_input:findings.some(f=>f.requires_human_input===true)
    };
  }
}
