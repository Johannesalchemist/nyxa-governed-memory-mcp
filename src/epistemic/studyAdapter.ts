/** Read-only study orchestrator. No autonomous writes, qualifications, or evidence promotion. */
export type StudyModule = {id:string;title:string;sourceUrls:string[];objectives:string[]};
export type StudyState = {completed:string[];failed:string[];unresolved:string[]};
export type StudyPlan = {module:StudyModule;tasks:readonly string[];requiresReview:boolean;authorityEffect:'NONE';promotionAllowed:false};
export function planStudyCycle(modules:readonly StudyModule[],state:StudyState):StudyPlan {
  const seen=new Set([...state.completed,...state.failed]);
  const next=modules.find(m=>!seen.has(m.id)) ?? modules.find(m=>state.failed.includes(m.id));
  if(!next)throw new Error('study_curriculum_exhausted');
  if(!next.id.trim()||!next.title.trim()||next.objectives.length===0||next.objectives.some(x=>!x.trim())||next.sourceUrls.length===0||next.sourceUrls.length>4)throw new Error('study_module_invalid');
  for(const source of next.sourceUrls){const url=new URL(source);if(url.protocol!=='https:'||url.username||url.password)throw new Error('study_source_invalid');}
  return {module:next,tasks:['retrieve_and_hash_sources','extract_claims_and_counterclaims','solve_new_holdout_cases','independent_review','record_errors_for_next_cycle'],requiresReview:true,authorityEffect:'NONE',promotionAllowed:false};
}
export const LAW_SCHOOL_S1:readonly StudyModule[]=[
 {id:'law-method',title:'Juristische Methodenlehre und Subsumtion',sourceUrls:['https://www.gesetze-im-internet.de/gg/'],objectives:['Normstruktur unterscheiden','Tatbestandsmerkmale am Sachverhalt prüfen','Gegenargumente dokumentieren']},
 {id:'law-constitutional',title:'Grundrechte und Verfassungsrecht',sourceUrls:['https://www.gesetze-im-internet.de/gg/'],objectives:['Schutzbereich, Eingriff und Rechtfertigung getrennt prüfen','Rechtsquellen zitieren','Ungewissheit kennzeichnen']}
];
