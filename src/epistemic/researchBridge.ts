import { z } from 'zod';
import { runDepthDrill } from './depthDrill.js';
import { PrimarySourceResearchProvider } from './primarySourceResearch.js';
import type { E0ClaimInput } from './e0Types.js';

const inputSchema = z.object({
 claim_id:z.string().min(1).max(200),statement:z.string().min(1).max(1600),
 evidence_strength:z.number().min(0).max(1),provenance_quality:z.number().min(0).max(1),impact_score:z.number().min(0).max(1)
}).strict();
const sourcesSchema=z.array(z.string().url()).min(1).max(4);
/** Bounded, read-only research bridge for the NYXA orchestrator. Never grants authority. */
export async function researchBridge(input: unknown, sources: unknown) {
 const packet: E0ClaimInput=inputSchema.parse(input);
 const urls=sourcesSchema.parse(sources);
 const provider=new PrimarySourceResearchProvider(urls);
 const outcome=await runDepthDrill(packet,provider,{
   max_iterations:1,max_research_agents:1,max_tool_calls:urls.length,max_wall_time_ms:15000,no_gain_stop_after:1
 });
 return {claim_id:packet.claim_id, outcome, epistemic_authority:'NONE', promotion_allowed:false};
}
