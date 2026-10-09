// Feedback-derived shadow candidate. The 12 earlier red-team examples are training data,
// and MUST NOT be counted as independent holdout evidence.
import {readFileSync,writeFileSync} from 'node:fs';
const training=JSON.parse(readFileSync('/tmp/nyxa-law-school-redteam.json','utf8')).outcomes;
const base=[[/bloße Objekte/,1],[/private Handlung/,2],[/vergleichbare Personen/,3],[/religiöse/,4],[/politischen Meinung/,5],[/Familie/,6],[/Demonstration/,8],[/Nachrichten/,10],[/Berufs/,12],[/Privatwohnung/,13]];
const extensions=new Map([[1,/erniedrigt|entwürdigt/i],[2,/Spazierengehen|Freizeitverhalten/i],[3,/gleich gelagerte|ungleich behandelt/i],[4,/Glaubenssymbol|Gottesdienst/i],[5,/Flugblatt|Presseäußerung/i],[6,/Eltern und Kind|Sorgerecht/i],[8,/Kundgebung|Protestzug/i],[10,/Telefonate|Briefverkehr/i],[12,/Gewerbes|berufliche Tätigkeit/i],[13,/durchsuchen.*Wohnung|Hausdurchsuchung/i]]);
const detect=(s,extended=false)=>base.find(([p])=>p.test(s))?.[1]??(extended?[...extensions].find(([,p])=>p.test(s))?.[0]??null:null);
const outcomes=training.map(x=>({id:x.id,expected:x.expected,base:detect(x.facts),candidate:detect(x.facts,true)}));
const result={kind:'SHADOW_FEEDBACK_FIT_ONLY',warning:'Hand-authored extensions after seeing red-team cases; this is training-set fit, NOT independent learning or generalization',total:outcomes.length,baselineCorrect:outcomes.filter(x=>x.base===x.expected).length,candidateCorrect:outcomes.filter(x=>x.candidate===x.expected).length,promotionAllowed:false,outcomes};
writeFileSync('/tmp/nyxa-law-school-feedback-fit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({kind:result.kind,total:result.total,baselineCorrect:result.baselineCorrect,candidateCorrect:result.candidateCorrect,promotionAllowed:result.promotionAllowed},null,2));
