import type { ResearchProvider, ResearchRequest, ResearchFinding } from './researchAgent.js';

export type ResearchMode = 'JEV_AUTO' | 'DIRECT_RESEARCH' | 'INDEPENDENT_CHECK';
export type ResearchDecision = {route:'LOCAL_JEV'|'EXTERNAL_RESEARCH'|'INDEPENDENT_CHECK'; reason:string};
export type JevResearchDecision = (request:ResearchRequest)=>Promise<ResearchDecision>;
export type ResearchModeDependencies = {
  localJev:ResearchProvider;
  external:ResearchProvider;
  independent:ResearchProvider;
  jevDecide:JevResearchDecision;
};
/** Shared E0 entrypoint. JEV decides only in AUTO; direct modes are explicit.
 * This adapter never grants authority or writes evidence or memory. */
export class NyxaResearchModes implements ResearchProvider {
  constructor(private readonly mode:ResearchMode,private readonly deps:ResearchModeDependencies){}
  async research(request:ResearchRequest):Promise<ResearchFinding>{
    const decision:ResearchDecision=this.mode==='JEV_AUTO'
      ?await this.deps.jevDecide(request)
      :this.mode==='INDEPENDENT_CHECK'
        ?{route:'INDEPENDENT_CHECK',reason:'explicit_independent_check'}
        :{route:'EXTERNAL_RESEARCH',reason:'explicit_direct_research'};
    if(!decision || !['LOCAL_JEV','EXTERNAL_RESEARCH','INDEPENDENT_CHECK'].includes(decision.route) || !decision.reason?.trim())
      throw new Error('jev_research_decision_invalid');
    const provider=decision.route==='LOCAL_JEV'?this.deps.localJev:
      decision.route==='INDEPENDENT_CHECK'?this.deps.independent:this.deps.external;
    return provider.research(request);
  }
}
