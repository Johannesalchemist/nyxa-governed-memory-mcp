// Diagnostic audit of a frozen synthetic holdout. No retuning against these cases.
import {readFileSync,writeFileSync} from 'node:fs';
const test=JSON.parse(readFileSync('/tmp/nyxa-law-school-holdout.json','utf8'));
const failures=test.rows.filter(x=>x.expected!==x.candidate);
const misses=failures.filter(x=>x.candidate===null&&x.expected!==null);
const falsePositive=failures.filter(x=>x.expected===null&&x.candidate!==null);
const confusion=failures.filter(x=>x.expected!==null&&x.candidate!==null&&x.expected!==x.candidate);
const byArticle=Object.fromEntries([...new Set(test.rows.map(x=>x.expected))].map(article=>[String(article),{total:test.rows.filter(x=>x.expected===article).length,correct:test.rows.filter(x=>x.expected===article&&x.candidate===article).length}]));
const out={kind:'FROZEN_HOLDOUT_ERROR_AUDIT',total:test.total,correct:test.candidateCorrect,misses:misses.length,falsePositive:falsePositive.length,confusion:confusion.length,byArticle,failures:failures.map(x=>({id:x.id,expected:x.expected,predicted:x.candidate,reason:x.candidate===null?'no_matching_rule':'wrong_rule'})),recommendation:'Do not tune on this holdout. Build independent legal case corpus and source-grounded argumentation evaluation.',promotionAllowed:false};
writeFileSync('/tmp/nyxa-law-school-error-audit.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
