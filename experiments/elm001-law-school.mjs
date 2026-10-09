// NYXA Law School, semester 1: citation-grounded constitutional-law retrieval assessment.
// This is an open-book statutory retrieval exam, NOT legal reasoning or qualification.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const evidence=JSON.parse(readFileSync('/tmp/nyxa-elm001-extracted-evidence.json','utf8'));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const docs=evidence.results.filter(x=>x.extracted&&x.paragraphs?.length);
const cases=[];
for(const doc of docs){
 for(const p of doc.paragraphs){
  cases.push({id:`GG-${doc.article}-${p.paragraph}`,question:`Gib den Wortlaut von Art. ${doc.article} Abs. ${p.paragraph} GG mit Fundstelle wieder.`,article:doc.article,paragraph:p.paragraph,expected:p.text,source:doc.url,sourceSha256:doc.sourceSha256});
 }
}
const normalize=x=>x.normalize('NFC').replace(/\s+/g,' ').trim();
const baseline=q=>docs.find(x=>x.article===q.article)?.paragraphs[0]?.text??'';
const retrieval=q=>docs.find(x=>x.article===q.article)?.paragraphs.find(p=>p.paragraph===q.paragraph)?.text??'';
const scored=cases.map(q=>({id:q.id,baselineCorrect:normalize(baseline(q))===normalize(q.expected),retrievalCorrect:normalize(retrieval(q))===normalize(q.expected),citation:`${q.source}#article-${q.article}-paragraph-${q.paragraph}`,sourceSha256:q.sourceSha256}));
const n=cases.length;
const result={kind:'LAW_SCHOOL_S1_OPEN_BOOK_RETRIEVAL_ONLY',warning:'No legal reasoning, no independent ground truth, no learning from feedback, no professional legal qualification',sourceCount:docs.length,questions:n,baselineCorrect:scored.filter(x=>x.baselineCorrect).length,retrievalCorrect:scored.filter(x=>x.retrievalCorrect).length,sourceDatasetSha256:sha(docs.map(x=>[x.url,x.sourceSha256])),scores:scored};
writeFileSync('/tmp/nyxa-law-school-semester1.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({kind:result.kind,sources:result.sourceCount,questions:n,baselineCorrect:result.baselineCorrect,retrievalCorrect:result.retrievalCorrect,warning:result.warning},null,2));
