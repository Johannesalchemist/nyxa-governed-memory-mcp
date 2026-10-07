export type CcamSourceKind='vehicle_ads'|'v2x'|'infrastructure'|'traffic_management'|'authority'|'emergency'|'simulator'|'human';
export type CcamTruthState='OBSERVED'|'SIMULATED'|'VERIFIED';
export type CcamTrlStage='SIL'|'SIMULATION'|'SHADOW'|'HIL'|'RELEVANT_ENVIRONMENT';
export type CcamEvent={version:'nyxa.ccam.v0';eventId:string;scenarioId:string;source:CcamSourceKind;truthState:CcamTruthState;timestamp:string;actor:{id:string;kind:string};state:Record<string,unknown>;location?:{frame:string;x:number;y:number;z?:number};confidence:number;odd:Record<string,unknown>;hazards:readonly string[];provenanceRefs:readonly string[]};
export type CcamCountermeasure={id:string;scenarioId:string;action:string;target:string;scope:string;expectedEffect:Record<string,number>;negativeImpactChecks:readonly string[];provenanceRefs:readonly string[]};
export type CcamOutcome={countermeasureId:string;truthState:CcamTruthState;observedEffect:Record<string,number>;negativeImpacts:readonly string[];provenanceRefs:readonly string[]};
export interface CcamAdapter {readonly id:string;readonly source:CcamSourceKind;normalize(input:unknown):CcamEvent;}
export function validateCcamEvent(e:CcamEvent):CcamEvent{if(e.version!=='nyxa.ccam.v0'||!e.eventId||!e.scenarioId||!e.provenanceRefs.length)throw new Error('ccam_event_provenance_required');if(!Number.isFinite(e.confidence)||e.confidence<0||e.confidence>1)throw new Error('ccam_event_confidence');return e;}
