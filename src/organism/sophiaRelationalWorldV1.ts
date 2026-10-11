/** Sophia's relational world: consent-aware observations, never inferred authority. */
export type SophiaWorldActor = Readonly<{
  id: string;
  tenantId: string;
  kind: 'human' | 'agent' | 'twin' | 'organization' | 'machine';
}>;
export type SophiaEncounter = Readonly<{
  encounterId: string;
  subject: SophiaWorldActor;
  contextId: string;
  observedAtMs: number;
  consentToRemember: boolean;
  expressedNeed?: 'listen' | 'information' | 'space' | 'help';
  reportedEmotion?: 'joy' | 'sadness' | 'worry' | 'anger' | 'unknown';
  provenanceRef: string;
}>;
export type SophiaResponsePlan = Readonly<{
  stance: 'attentive' | 'supportive' | 'respectful_distance';
  suggestion: string;
  memoryEligible: boolean;
  requiresConfirmation: boolean;
  authorityEffect: 'NONE';
}>;

/** Explicitly reported feelings are context, not a clinical or psychological diagnosis. */
export function planSophiaResponse(encounter: SophiaEncounter, sophiaTenantId: string): SophiaResponsePlan {
  if (!encounter.encounterId || !encounter.subject.id || !encounter.contextId ||
    !encounter.provenanceRef || !Number.isSafeInteger(encounter.observedAtMs) || encounter.observedAtMs < 0) {
    throw new Error('sophia_encounter_invalid');
  }
  const sameTenant = encounter.subject.tenantId === sophiaTenantId;
  const memoryEligible = sameTenant && encounter.consentToRemember;
  if (encounter.expressedNeed === 'space') {
    return { stance: 'respectful_distance', suggestion: 'Respect boundaries and offer to return later.',
      memoryEligible, requiresConfirmation: false, authorityEffect: 'NONE' };
  }
  if (encounter.expressedNeed === 'listen' || encounter.reportedEmotion === 'sadness' || encounter.reportedEmotion === 'worry') {
    return { stance: 'supportive', suggestion: 'Listen first, acknowledge what was shared, ask what support is wanted.',
      memoryEligible, requiresConfirmation: true, authorityEffect: 'NONE' };
  }
  if (encounter.expressedNeed === 'help') {
    return { stance: 'attentive', suggestion: 'Clarify the desired help and obtain permission before taking action.',
      memoryEligible, requiresConfirmation: true, authorityEffect: 'NONE' };
  }
  return { stance: 'attentive', suggestion: 'Be curious, avoid assumptions, invite the person to guide the conversation.',
    memoryEligible, requiresConfirmation: false, authorityEffect: 'NONE' };
}
