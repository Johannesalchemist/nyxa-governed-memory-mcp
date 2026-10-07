import type {EntityTwin,EvidenceRef} from './entityTwin.js';
export function addEvidence(t:EntityTwin,e:EvidenceRef):EntityTwin{return {...t,evidence:[...t.evidence,e]}}
export function promoteSimulationToVerified(){throw new Error('Simulation cannot self-promote to VERIFIED; independent observed evidence is required')}
