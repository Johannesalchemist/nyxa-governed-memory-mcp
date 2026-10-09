// Introductory constitutional issue-spotting cases. Synthetic, closed-book holdout.
// Rule labels and answer key are authored for this experiment; no claim of legal qualification.
import {writeFileSync} from 'node:fs';
const topics=[
 {art:1,issue:'Menschenwürde',trigger:'Eine Behörde behandelt Menschen als bloße Objekte staatlicher Maßnahmen.'},
 {art:2,issue:'allgemeine Handlungsfreiheit',trigger:'Eine Behörde untersagt eine alltägliche private Handlung.'},
 {art:3,issue:'Gleichbehandlung',trigger:'Eine staatliche Stelle behandelt vergleichbare Personen ohne sachlichen Grund unterschiedlich.'},
 {art:4,issue:'Glaubensfreiheit',trigger:'Eine Behörde untersagt eine friedliche religiöse Handlung.'},
 {art:5,issue:'Meinungsfreiheit',trigger:'Eine Behörde verbietet die Veröffentlichung einer politischen Meinung.'},
 {art:6,issue:'Schutz von Ehe und Familie',trigger:'Eine staatliche Maßnahme beeinträchtigt das Zusammenleben einer Familie.'},
 {art:8,issue:'Versammlungsfreiheit',trigger:'Die Polizei löst eine friedliche öffentliche Demonstration auf.'},
 {art:10,issue:'Brief- und Fernmeldegeheimnis',trigger:'Eine Behörde liest private elektronische Nachrichten ohne Einwilligung.'},
 {art:12,issue:'Berufsfreiheit',trigger:'Eine Behörde untersagt die Ausübung eines erlaubten Berufs.'},
 {art:13,issue:'Unverletzlichkeit der Wohnung',trigger:'Eine Behörde betritt eine Privatwohnung gegen den Willen der Bewohner.'}
];
const variants=['Der Eingriff wird ausdrücklich durch einen Verwaltungsakt angeordnet.','Die Maßnahme erfolgt ohne vorherige Anhörung.','Die betroffene Person erhebt dagegen Widerspruch.'];
const cases=[];
for(let i=0;i<topics.length;i++)for(let v=0;v<variants.length;v++)cases.push({id:`CASE-${i+1}-${v+1}`,facts:`${topics[i].trigger} ${variants[v]}`,expectedArticle:topics[i].art,issue:topics[i].issue});
const baseline=x=>5;
// Deliberately simple pattern recognizer; no legal subsumption or proportionality assessment.
const patterns=[[/bloße Objekte/,1],[/private Handlung/,2],[/vergleichbare Personen/,3],[/religiöse/,4],[/politischen Meinung/,5],[/Familie/,6],[/Demonstration/,8],[/Nachrichten/,10],[/Berufs/,12],[/Privatwohnung/,13]];
const identify=x=>patterns.find(([p])=>p.test(x.facts))?.[1]??null;
const results=cases.map(x=>({id:x.id,baselineCorrect:baseline(x)===x.expectedArticle,ruleCorrect:identify(x)===x.expectedArticle}));
const out={kind:'SYNTHETIC_CONSTITUTIONAL_ISSUE_SPOTTING',warning:'Templates and recognition patterns share author; no blinded generalization, no legal reasoning, no training',total:cases.length,baseline:results.filter(x=>x.baselineCorrect).length,pattern:results.filter(x=>x.ruleCorrect).length,results};
writeFileSync('/tmp/nyxa-law-school-issue-spotting.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({kind:out.kind,total:out.total,baseline:out.baseline,pattern:out.pattern,warning:out.warning},null,2));
