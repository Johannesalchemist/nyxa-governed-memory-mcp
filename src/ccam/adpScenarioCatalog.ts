import {hashRecord} from './adp.js';
export type AdpScenario={id:string;source:string;sourceRef:string;capabilityIds:readonly string[];odd:Record<string,unknown>;parameters:Record<string,readonly (string|number|boolean)[]>;minimumVariants:number;provenanceRefs:readonly string[]};
export function validateScenario(s:AdpScenario){if(!s.id||!s.sourceRef||!s.capabilityIds.length||!s.provenanceRefs.length||s.minimumVariants<1)throw new Error('adp_scenario_invalid');return s}
export function scenarioVariants(s:AdpScenario){const entries=Object.entries(s.parameters);let n=1;for(const[,v]of entries)n*=Math.max(1,v.length);return n}
export function catalogHash(xs:readonly AdpScenario[]){return hashRecord(xs.map(validateScenario))}
export const munichSeedCatalog:readonly AdpScenario[]=[
{id:'munich:intersection:t-junction',source:'EU-2022-1426',sourceRef:'Annex-III-Part3-8.3',capabilityIds:['road_geometry'],odd:{urban:true},parameters:{signalized:[true,false],leadVehicle:['none','car','ptw'],approachingTraffic:[true,false]},minimumVariants:3,provenanceRefs:['eurlex:2022/1426:annexIII:8.3']},
{id:'munich:temporary-roadworks',source:'EU-2022-1426',sourceRef:'Annex-III-Part3-8.4',capabilityIds:['traffic_rules_infrastructure'],odd:{urban:true},parameters:{temporaryChange:['cones','signs','access_restriction'],leadVehicle:['none','car','ptw']},minimumVariants:3,provenanceRefs:['eurlex:2022/1426:annexIII:8.4']},
{id:'munich:pedestrian-cyclist-crossing',source:'EU-2022-1426',sourceRef:'Annex-III-Part3-8.4',capabilityIds:['vulnerable_road_users'],odd:{urban:true},parameters:{actor:['pedestrian','cyclist'],presence:['approaching','crossing','none']},minimumVariants:3,provenanceRefs:['eurlex:2022/1426:annexIII:8.4']}
];
