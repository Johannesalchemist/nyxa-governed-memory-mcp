import type { ResearchProvider, ResearchRequest, ResearchFinding } from './researchAgent.js';
import { createHash } from 'node:crypto';

/** Read-only source retrieval. Content is never treated as authority or an E0 score override. */
export class PrimarySourceResearchProvider implements ResearchProvider {
  constructor(private readonly sources: readonly string[], private readonly fetcher: typeof fetch = fetch) {
    if (sources.length < 1 || sources.length > 4) throw new Error('source_count_out_of_bounds');
    for (const raw of sources) {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        !['eur-lex.europa.eu','ec.europa.eu','commission.europa.eu','www.gesetze-im-internet.de','www.bafa.de','www.bmwk.de','www.bundesfinanzministerium.de','www.exist.de','www.foerderdatenbank.de'].includes(url.hostname)) throw new Error('source_not_allowlisted');
    }
  }
  async research(request: ResearchRequest): Promise<ResearchFinding> {
    const provenance_refs: string[] = [];
    const missing_observables: string[] = [];
    let used = 0;
    for (const source of this.sources) {
      if (request.signal?.aborted) break;
      used++;
      try {
        const response = await this.fetcher(source, {signal: request.signal ?? null, redirect: 'error', headers: {Accept:'text/html,text/plain,application/json'}});
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !/^(text\/html|text\/plain|application\/json)/i.test(type)) {
          missing_observables.push(`${source}:unusable_response`);
          await response.body?.cancel();
          continue;
        }
        const reader = response.body?.getReader();
        if (!reader) { missing_observables.push(`${source}:empty_body`); continue; }
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        try {
          while (true) {
            const {done,value} = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 128 * 1024) throw new Error('source_too_large');
            chunks.push(value);
          }
          const body = Buffer.concat(chunks);
          // Bot challenges and access gates are not primary-source documents.
          const probe = body.toString('utf8', 0, Math.min(body.length, 4096));
          if (/verify that you(?:'|’)re not a robot|enable javascript and then reload the page|captcha|cf-chl-|access denied/i.test(probe)) {
            missing_observables.push(`${source}:access_challenge_not_source`);
            continue;
          }
          const digest = createHash('sha256').update(body).digest('hex');
          provenance_refs.push(`${source}#sha256=${digest}`);
          // An excerpt is an untrusted observation, not proof that the claim is true.
          // Keep external content inert and bounded until a separate semantic verifier exists.
          const raw = body.toString('utf8');
          const excerpt = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
          if (excerpt) missing_observables.push(`${source}:unverified_source_excerpt:${JSON.stringify(excerpt)}`);
          else missing_observables.push(`${source}:no_extractable_text`);
        } finally { await reader.cancel().catch(() => undefined); }
      } catch {
        missing_observables.push(`${source}:fetch_failed_or_bounded`);
      }
    }
    return {supporting_evidence:[],disconfirming_evidence:[],alternative_hypotheses:[],missing_observables,provenance_refs,contradictions:[],tool_calls_used:used,requires_human_input:true};
  }
}
