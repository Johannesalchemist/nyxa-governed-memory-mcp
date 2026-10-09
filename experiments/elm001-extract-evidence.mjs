// Bounded, read-only extraction of exact official legal paragraphs. Not semantic validation.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const entities=s=>s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&(?:nbsp|#160);/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=s=>entities(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const results=[];
for(let article=1;article<=30;article++){
 const url=`https://www.gesetze-im-internet.de/gg/art_${article}.html`;
 try{
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000)});
  const type=response.headers.get('content-type')??'';
  if(!response.ok||!type.toLowerCase().includes('text/html'))throw Error('bad_response');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>128*1024)throw Error('source_too_large');
  const html=bytes.toString('latin1');
  const matches=[...html.matchAll(/<div class="jurAbsatz">([\s\S]*?)<\/div>/g)];
  const paragraphs=matches.map((m,i)=>({paragraph:i+1,text:strip(m[1])}));
  results.push({article,url,sourceSha256:sha(bytes),paragraphs,extracted:paragraphs.length>0,authorityEffect:'NONE'});
 }catch(e){results.push({article,url,extracted:false,error:String(e),authorityEffect:'NONE'});}
}
const out={kind:'REAL_OFFICIAL_TEXT_EXTRACTION_NOT_LEARNING',timestamp:new Date().toISOString(),retrieved:results.filter(r=>r.extracted).length,total:results.length,results};
writeFileSync('/tmp/nyxa-elm001-extracted-evidence.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({total:out.total,extracted:out.retrieved,paragraphs:results.reduce((s,r)=>s+(r.paragraphs?.length??0),0),example:results[0]?.paragraphs?.[0],errors:results.filter(r=>r.error).map(r=>r.article)},null,2));
