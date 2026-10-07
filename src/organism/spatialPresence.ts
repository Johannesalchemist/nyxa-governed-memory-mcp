export type SpatialMedium =
  | 'DISPLAY' | 'LED_ROTOR' | 'PROJECTION' | 'HAZER' | 'FOG'
  | 'ULTRASONIC_MIST' | 'DRY_ICE_FOG' | 'SCENT_AEROSOL';

export type PresenceMode = 'SIMULATION_ONLY' | 'SHADOW' | 'ELIGIBLE';

export interface SpatialPresenceTrial {
  medium: SpatialMedium;
  mode: PresenceMode;
  liveEffects: false;
  authorityEffect: 'NONE';
  emergenceDistanceCm: number;
  contrast: number;
  edgeSharpness: number;
  stability: number;
  latencyMs: number;
  mediumVisibility: number;
  aerosolMassMg?: number;
}

export function assessSpatialPresenceTrial(t: SpatialPresenceTrial) {
  const reasons: string[] = [];
  if (t.liveEffects !== false) reasons.push('LIVE_EFFECTS_FORBIDDEN');
  if (t.authorityEffect !== 'NONE') reasons.push('AUTHORITY_EFFECT_FORBIDDEN');
  const metrics = { emergenceDistanceCm:t.emergenceDistanceCm, contrast:t.contrast,
    edgeSharpness:t.edgeSharpness, stability:t.stability, latencyMs:t.latencyMs,
    mediumVisibility:t.mediumVisibility };
  for (const [k,v] of Object.entries(metrics))
    if (!Number.isFinite(v) || v < 0) reasons.push(`INVALID_${k.toUpperCase()}`);
  return { eligible: reasons.length === 0, reasons };
}

export const spatialPresenceAblation: SpatialMedium[] =
  ['HAZER','FOG','ULTRASONIC_MIST','DRY_ICE_FOG','SCENT_AEROSOL'];

export const spatialPresenceInvariant = {
  simulationIsNotReality: true,
  capabilityIsNotAuthority: true,
  scentAndOpticalAerosolAreDistinctChannels: true,
  physicalLaserSafetyInterlockRequired: true,
  autonomousLiveActivation: false
} as const;
