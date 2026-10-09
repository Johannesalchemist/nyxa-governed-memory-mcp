import type { ResearchProvider, ResearchRequest, ResearchFinding } from './researchAgent.js';

const MAX_SOURCE_BYTES = 128 * 1024;

type ExpectedIdentity =
  | { kind: 'eurlex_celex'; celex: string; citation: string }
  | { kind: 'request_url' };

function expectedIdentity(source: string): ExpectedIdentity {
  const url = new URL(source);
  if (url.hostname === 'eur-lex.europa.eu') {
    const raw = url.searchParams.get('uri') ?? '';
    const match = /^CELEX:(3(\d{4})[A-Z](\d+))$/i.exec(raw);
    if (match) {
      const number = String(Number.parseInt(match[3]!, 10));
      return { kind: 'eurlex_celex', celex: match[1]!.toUpperCase(), citation: `${match[2]}/${number}` };
    }
  }
  return { kind: 'request_url' };
}

function verifyIdentity(source: string, responseUrl: string, body: string): string | null {
  let requested: URL;
  let delivered: URL;
  try {
    requested = new URL(source);
    delivered = new URL(responseUrl);
  } catch {
    return null;
  }
  if (requested.href !== delivered.href) return null;

  const expected = expectedIdentity(source);
  if (expected.kind === 'request_url') return 'request-url';

  const title = /<title[^>]*>([^<]{1,500})<\/title>/i.exec(body)?.[1] ?? '';
  if (!body.toUpperCase().includes(expected.celex)) return null;
  if (!/EUR-Lex/i.test(title) || !title.includes(expected.citation)) return null;
  return `eurlex-celex:${expected.celex}`;
}

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
            if (bytes > MAX_SOURCE_BYTES) throw new Error('source_too_large');
            chunks.push(value);
          }
          const body = new TextDecoder().decode(Buffer.concat(chunks));
          const identity = verifyIdentity(source, response.url, body);
          if (!identity) {
            missing_observables.push(`${source}:document_identity_mismatch`);
            continue;
          }
          provenance_refs.push(`${source}#retrieved_bytes=${bytes}&identity=${encodeURIComponent(identity)}`);
        } finally { await reader.cancel().catch(() => undefined); }
      } catch {
        missing_observables.push(`${source}:fetch_failed_or_bounded`);
      }
    }
    return {supporting_evidence:[],disconfirming_evidence:[],alternative_hypotheses:[],missing_observables,provenance_refs,contradictions:[],tool_calls_used:used,requires_human_input:true};
  }
}
