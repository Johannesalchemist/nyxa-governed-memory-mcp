export type SignalClass="I0"|"LEARNING"|"CONTRADICTION"|"SECURITY"|"I2_I3";
export function shedOrder(c:SignalClass){return{I0:0,LEARNING:1,CONTRADICTION:3,SECURITY:4,I2_I3:5}[c];}
export function backpressureDecision(queueDepth:number,limit:number,c:SignalClass){if(queueDepth<=limit)return{accept:true,recordDrop:false};const protectedClass=c==="SECURITY"||c==="CONTRADICTION"||c==="I2_I3";return{accept:protectedClass,recordDrop:!protectedClass};}
export function sequenceReplay(lastAccepted:number,incoming:number,nonceSeen:boolean){if(nonceSeen)return{allowed:false,reason:"nonce_replay"};if(incoming<=lastAccepted)return{allowed:false,reason:"stale_or_out_of_order"};return{allowed:true,reason:"fresh"};}
