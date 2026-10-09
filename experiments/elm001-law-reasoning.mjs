// Source-grounded issue outline, NOT autonomous legal subsumption or legal advice.
// Every legal text quote must be copied from a fetched official source.
import {readFileSync,writeFileSync} from 'node:fs';
const corpus=JSON.parse(readFileSync('/tmp/nyxa-elm001-extracted-evidence.json','utf8'));
const docs=new Map(corpus.results.filter(x=>x.extracted).map(x=>[x.article,x]));
const scenarios=[
 {id:'S1',facts:'Die Stadt untersagt eine friedliche Versammlung auf dem Marktplatz.',article:8,question:'Darf die Stadt die Versammlung untersagen?'},
 {id:'S2',facts:'Ein Amt verbietet einer Person, ihre politische Meinung öffentlich zu äußern.',article:5,question:'Ist das Verbot verfassungsgemäß?'},
 {id:'S3',facts:'Eine Behörde durchsucht ohne Einwilligung die Wohnung eines Bürgers.',article:13,question:'Ist die Durchsuchung rechtmäßig?'},
 {id:'S4',facts:'Eine Behörde behandelt zwei vergleichbare Antragsteller unterschiedlich.',article:3,question:'Ist die Ungleichbehandlung gerechtfertigt?'},
 {id:'S5',facts:'Eine staatliche Stelle schränkt die Ausübung eines Berufs ein.',article:12,question:'Ist der Eingriff zulässig?'}
];
const outputs=scenarios.map(s=>{
 const source=docs.get(s.article);
 const quotes=source?.paragraphs?.slice(0,3).map(p=>({paragraph:p.paragraph,exactText:p.text,source:source.url,sourceSha256:source.sourceSha256}))??[];
 return {id:s.id,facts:s.facts,question:s.question,issue:`Mögliche Betroffenheit von Art. ${s.article} GG`,sourceAvailable:quotes.length>0,quotes,analysis:{schutzbereich:'Zu prüfen; aus dem Sachverhalt nicht abschließend feststellbar',eingriff:'Zu prüfen; konkrete Maßnahme und Adressat aufklären',rechtfertigung:'Gesetzliche Grundlage, Schranken und Verhältnismäßigkeit nicht nachgewiesen',gegenargumente:'Mögliche gesetzliche Befugnis und widerstreitende Rechtsgüter noch offen',ergebnis:'OFFEN: Keine rechtliche Entscheidung ohne weitere Tatsachen und Rechtsprechungsprüfung'},epistemicAuthority:'NONE',promotionAllowed:false};
});
const result={kind:'SOURCE_GROUNDED_LEGAL_ISSUE_OUTLINES',warning:'Issue outlines and direct quotes only; no autonomous legal reasoning or validated subsumption',total:outputs.length,withSource:outputs.filter(x=>x.sourceAvailable).length,decisionsMade:0,outputs};
writeFileSync('/tmp/nyxa-law-school-reasoning-outlines.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({kind:result.kind,total:result.total,withSource:result.withSource,decisionsMade:result.decisionsMade,first:outputs[0].analysis},null,2));
