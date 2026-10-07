import {hashRecord} from './adp.js';
export type RegulatoryPurpose='TYPE_APPROVAL'|'CONTINUOUS_SUPERVISION'|'REGULATORY_LEARNING';
export type RegulatoryDatum={id:string;sourceLaw:string;sourceClause:string;systemId:string;systemVersion:string;timestamp:string;fields:Record<string,unknown>;purposes:readonly RegulatoryPurpose[];provenanceRefs:readonly string[];hash:string};
export function ingestRegulatoryDatum(x:Omit<RegulatoryDatum,'hash'>):RegulatoryDatum{if(!x.sourceLaw||!x.sourceClause||!x.provenanceRefs.length||!x.purposes.length)throw new Error('regulatory_datum_incomplete');return{...x,hash:hashRecord(x)}}
export function verifyRegulatoryDatum(x:RegulatoryDatum){const{hash,...body}=x;return hash===hashRecord(body)}
export function forPurpose(x:RegulatoryDatum,p:RegulatoryPurpose){if(!verifyRegulatoryDatum(x)||!x.purposes.includes(p))throw new Error('regulatory_purpose_denied');return x}
