export type ExposureState="EXPOSED"|"POSSIBLY_EXPOSED"|"UNEXPOSED_DEMONSTRATED"|"UNKNOWN";
export function observationUse(exposure:ExposureState){return{worldModelValidation:exposure==="UNEXPOSED_DEMONSTRATED",effectMeasurement:true,treatedAsPossiblyExposed:exposure!=="UNEXPOSED_DEMONSTRATED"};}
