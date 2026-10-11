import { consultNewsroom } from '../cognitive/newsroom.js';
import { AUTO_FAMILIES, selectModel, type CatalogModel, type ModelFamily } from '../cognitive/modelRegistry.js';
import { ResearchProviderRegistry, RoutedResearchProvider, type ResearchRoute } from './researchRouter.js';
import type { ResearchProvider, ResearchRequest, ResearchFinding } from './researchAgent.js';

const empty = (): ResearchFinding => ({supporting_evidence:[],disconfirming_evidence:[],alternative_hypotheses:[],missing_observables:[],provenance_refs:[],contradictions:[]});
const fields = ['supporting_evidence','disconfirming_evidence','alternative_hypotheses','missing_observables','provenance_refs','contradictions'] as const;
function parseFinding(output: string): ResearchFinding {
  let parsed: unknown;
  try { parsed=JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g,'')); } catch { throw new Error('research_response_not_json'); }
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))throw new Error('research_response_invalid');
  const data=parsed as Record<string,unknown>;const result=empty();
  for(const field of fields){
    const value=data[field];
    if(!Array.isArray(value)||value.some(x=>typeof x!=='string'||x.length>2048)||value.length>50)throw new Error('research_response_schema_invalid');
    result[field]=value;
  }
  return result;
}
export function buildOpenRouterResearchProvider(catalog: CatalogModel[],route:ResearchRoute='INDEPENDENT_CHECK'):ResearchProvider {
  const families=AUTO_FAMILIES.research;
  const chosen: Array<{family:ModelFamily;model:string;identity:string}>=[];
  for(const family of families){
    const model=selectModel(catalog,family,'research');
    if(!model)continue;
    const identity=model.split('/')[0]?.toLowerCase();
    if(!identity||chosen.some(x=>x.identity===identity))continue;
    chosen.push({family,model,identity});
  }
  const registry=new ResearchProviderRegistry({jevProviderId:'local-jev-unconfigured',externalProviderIds:chosen.map(x=>x.model)});
  for(const entry of chosen){
    registry.register({id:entry.model,external:true,modelId:entry.model,providerIdentity:entry.identity,provider:{
      async research(request:ResearchRequest):Promise<ResearchFinding>{
        const prompt=JSON.stringify({instruction:'Research the claim. Return ONLY JSON with six arrays: supporting_evidence, disconfirming_evidence, alternative_hypotheses, missing_observables, provenance_refs, contradictions. Cite original source URLs where possible. Never claim independent verification.',claim:request.statement,evidence_packet:request.evidence_packet,prior_alternatives:request.prior_alternative_hypotheses??[]});
        const result=await consultNewsroom({prompt,participants:[entry.family],modality:'research',pinned_models:{[entry.family]:entry.model}});
        const rows=result['contributions'];
        const contribution=Array.isArray(rows)?rows[0] as Record<string,unknown>|undefined:undefined;
        if(contribution?.['status']!=='ok'||contribution['actual_model']!==entry.model||typeof contribution['output']!=='string')throw new Error('openrouter_research_provenance_unverified');
        const finding=parseFinding(contribution['output']);
        // Model provenance is metadata, never a primary-source citation.
        // Do not contaminate source-diversity checks with model IDs.
        return finding;
      }
    }});
  }
  return new RoutedResearchProvider(registry,route);
}
