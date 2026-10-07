import type {AdpStatus} from './adp.js';
const transitions:Record<AdpStatus,readonly AdpStatus[]>={DRAFT:['EXAM_READY'],EXAM_READY:['QUALIFIED','RESTRICTED'],QUALIFIED:['RESTRICTED','SUSPENDED','EXPIRED'],RESTRICTED:['EXAM_READY','SUSPENDED','EXPIRED'],SUSPENDED:['EXAM_READY','EXPIRED'],EXPIRED:[]};
export function transitionAdp(from:AdpStatus,to:AdpStatus){if(!transitions[from].includes(to))throw new Error('adp_illegal_transition');return to}
