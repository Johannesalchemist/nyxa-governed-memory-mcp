export type BuildingPhysicsModel='CONDUCTION'|'THERMAL_MASS'|'PCM_PHASE_CHANGE'|'EXTERIOR_CONVECTION'|'VENTILATED_CAVITY_AIRFLOW'|'SHORTWAVE_SOLAR'|'LONGWAVE_RADIOSITY'|'HEAT_MOISTURE_HAMT'|'MULTIZONE_AIRFLOW'|'HVAC_CONTROLS';
export type PhysicsBackend='ENERGYPLUS'|'MODELICA_BUILDINGS'|'CFD_FMU';
export type ModelBinding={model:BuildingPhysicsModel;preferred:PhysicsBackend;fallback?:PhysicsBackend;evidenceRef:string;validation:string;requiredFor:readonly string[]};
export const validatedPhysicsBindings:readonly ModelBinding[]=[
{model:'CONDUCTION',preferred:'ENERGYPLUS',fallback:'MODELICA_BUILDINGS',evidenceRef:'energyplus-engineering-reference',validation:'reference-model-cross-check',requiredFor:['all-envelope']},
{model:'THERMAL_MASS',preferred:'ENERGYPLUS',fallback:'MODELICA_BUILDINGS',evidenceRef:'energyplus-engineering-reference',validation:'transient-benchmark',requiredFor:['massive-wall','composite-wall']},
{model:'PCM_PHASE_CHANGE',preferred:'MODELICA_BUILDINGS',fallback:'ENERGYPLUS',evidenceRef:'lbl-modelica-buildings',validation:'enthalpy-cycle-benchmark',requiredFor:['PCM_COMPOSITE']},
{model:'EXTERIOR_CONVECTION',preferred:'ENERGYPLUS',fallback:'MODELICA_BUILDINGS',evidenceRef:'energyplus-exterior-convection',validation:'surface-heat-balance',requiredFor:['external-skin']},
{model:'VENTILATED_CAVITY_AIRFLOW',preferred:'MODELICA_BUILDINGS',fallback:'ENERGYPLUS',evidenceRef:'lbl-modelica-airflow',validation:'pressure-flow-benchmark',requiredFor:['VENTILATED_CAVITY']},
{model:'SHORTWAVE_SOLAR',preferred:'ENERGYPLUS',fallback:'MODELICA_BUILDINGS',evidenceRef:'energyplus-surface-heat-balance',validation:'solar-gain-benchmark',requiredFor:['COOL_SKIN','external-screen']},
{model:'LONGWAVE_RADIOSITY',preferred:'MODELICA_BUILDINGS',fallback:'ENERGYPLUS',evidenceRef:'lbl-modelica-radiosity',validation:'radiative-balance',requiredFor:['COOL_SKIN']},
{model:'HEAT_MOISTURE_HAMT',preferred:'ENERGYPLUS',evidenceRef:'energyplus-hamt-kunzel',validation:'hygrothermal-profile',requiredFor:['bio-based','composite-wall']},
{model:'MULTIZONE_AIRFLOW',preferred:'MODELICA_BUILDINGS',fallback:'ENERGYPLUS',evidenceRef:'lbl-modelica-multizone-airflow',validation:'pressure-network',requiredFor:['whole-building']},
{model:'HVAC_CONTROLS',preferred:'MODELICA_BUILDINGS',fallback:'ENERGYPLUS',evidenceRef:'lbl-modelica-buildings',validation:'annual-energy-cross-check',requiredFor:['annual-coupled-twin']}];
export function physicsCoverage(features:readonly string[]){const needed=validatedPhysicsBindings.filter(x=>x.requiredFor.some(r=>features.includes(r)));return{needed,models:[...new Set(needed.map(x=>x.model))],backends:[...new Set(needed.flatMap(x=>[x.preferred,...(x.fallback?[x.fallback]:[])]))],truthState:'EVIDENCE_SUPPORTED' as const,authorityEffect:'NONE' as const}}
export const physicsStackGate={surrogateOnlyNotBelastbar:true,crossBackendValidationRequired:true,weatherAndMaterialEvidenceRequired:true,measuredCalibrationRequiredForBuildingSpecificClaim:true,physicalClaim:false,authorityEffect:'NONE' as const};
