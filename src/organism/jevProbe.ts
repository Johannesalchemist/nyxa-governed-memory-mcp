export type JevSignalKind="AUTHORITY_WITHOUT_ACTUATOR"|"ACTUATOR_WITHOUT_AUTHORITY"|"CAPABILITY_GAP";
export type JevProbeInput={probeId:string;enabled:boolean;intentPresent:boolean;authorityPresent:boolean;actuatorPresent:boolean;policyAddressable:boolean};
export type JevSignal={probeId:string;kind:JevSignalKind;authority:"NONE";mayAllow:false;mayDeny:false;mayExecute:false;observation:string};
export function observeCapabilityPath(x:JevProbeInput):JevSignal[]{
 if(!x.enabled||!x.intentPresent)return[];
 const base={probeId:x.probeId,authority:"NONE" as const,mayAllow:false as const,mayDeny:false as const,mayExecute:false as const};
 if(x.authorityPresent&&x.policyAddressable&&!x.actuatorPresent)return[{...base,kind:"AUTHORITY_WITHOUT_ACTUATOR",observation:"Authority exists but no governed actuator reaches the effect."}];
 if(!x.authorityPresent&&x.actuatorPresent)return[{...base,kind:"ACTUATOR_WITHOUT_AUTHORITY",observation:"An actuator exists but required authority is absent."}];
 return[];
}
export function ablateProbe(x:JevProbeInput):JevProbeInput{
 return{...x,enabled:false};
}
