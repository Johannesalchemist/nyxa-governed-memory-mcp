export type LegalForm='SOLE_PROP_DE'|'UG_DE'|'GMBH_DE'|'GUG_DE'|'GGMBH_DE'|'FOUNDATION_DE'|'LLC_US';
export type FactState='VERIFIED'|'HYPOTHESIZED';
export interface StructureNode {id:string;form:LegalForm;country:'DE'|'US';roles:string[];facts:{limitedLiability?:boolean;minimumCapitalEur?:number;taxPrivilegedPurposeRequired?:boolean;profitDistributionRestricted?:boolean;foundationCapitalAdequacyRequired?:boolean;state:FactState;source:string}[]}
export interface BusinessStructure {id:string;nodes:StructureNode[];edges:{from:string;to:string;kind:'OWNS'|'LICENSES_IP'|'PROVIDES_SERVICE'|'DISTRIBUTES'|'FUNDS'}[]}
export interface StructureObjectives {capitalEfficiency:number;liabilityProtection:number;investability:number;missionLock:number;internationalReach:number;adminSimplicity:number;restructuringFlexibility:number}
export const legalFormCatalog:Record<LegalForm,StructureNode['facts']> = {
SOLE_PROP_DE:[{limitedLiability:false,minimumCapitalEur:0,state:'VERIFIED',source:'BMWK Existenzgruendungsportal Rechtsformen'}],
UG_DE:[{limitedLiability:true,minimumCapitalEur:1,state:'VERIFIED',source:'GmbHG §5a / BMWK'}],
GMBH_DE:[{limitedLiability:true,minimumCapitalEur:25000,state:'VERIFIED',source:'GmbHG §5 / BMWK'}],
GUG_DE:[{limitedLiability:true,taxPrivilegedPurposeRequired:true,state:'VERIFIED',source:'BMWK: gemeinnuetzige UG grundsätzlich möglich'}],
GGMBH_DE:[{limitedLiability:true,minimumCapitalEur:25000,taxPrivilegedPurposeRequired:true,state:'VERIFIED',source:'GmbHG §4'}],
FOUNDATION_DE:[{foundationCapitalAdequacyRequired:true,state:'VERIFIED',source:'Regierungspraesidien Baden-Wuerttemberg Stiftung Anerkennung'}],
LLC_US:[{state:'HYPOTHESIZED',source:'Requires state-specific US legal/tax verification before scoring'}]
};
export function validateStructure(s:BusinessStructure){const issues:string[]=[];for(const n of s.nodes){if(n.form==='LLC_US')issues.push('US_LLC_REQUIRES_STATE_TAX_LEGAL_VERIFICATION');if((n.form==='GUG_DE'||n.form==='GGMBH_DE')&&n.roles.includes('UNRESTRICTED_PROFIT_DISTRIBUTION'))issues.push('CHARITABLE_PURPOSE_CONFLICT:'+n.id)}return {valid:issues.length===0,issues,truthState:'SIMULATED' as const}}
