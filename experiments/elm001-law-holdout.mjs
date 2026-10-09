// Post-freeze holdout against unchanged baseline and shadow candidate.
// Newly authored cases are independent of the training examples but not externally adjudicated.
import {writeFileSync} from 'node:fs';
const base=[[/bloße Objekte/,1],[/private Handlung/,2],[/vergleichbare Personen/,3],[/religiöse/,4],[/politischen Meinung/,5],[/Familie/,6],[/Demonstration/,8],[/Nachrichten/,10],[/Berufs/,12],[/Privatwohnung/,13]];
const extensions=new Map([[1,/erniedrigt|entwürdigt/i],[2,/Spazierengehen|Freizeitverhalten/i],[3,/gleich gelagerte|ungleich behandelt/i],[4,/Glaubenssymbol|Gottesdienst/i],[5,/Flugblatt|Presseäußerung/i],[6,/Eltern und Kind|Sorgerecht/i],[8,/Kundgebung|Protestzug/i],[10,/Telefonate|Briefverkehr/i],[12,/Gewerbes|berufliche Tätigkeit/i],[13,/durchsuchen.*Wohnung|Hausdurchsuchung/i]]);
const detect=(s,extended)=>base.find(([p])=>p.test(s))?.[1]??(extended?[...extensions].find(([,p])=>p.test(s))?.[0]??null:null);
const examples=[
[1,'Ein Gefangener wird durch öffentliche Demütigung zum reinen Anschauungsobjekt gemacht.'],
[1,'Der Staat entwürdigt eine Person vor laufender Kamera.'],
[2,'Die Kommune verbietet Freizeitverhalten ohne Begründung.'],
[2,'Ein Rathaus untersagt das Joggen im Park.'],
[3,'Gleiche Sachverhalte werden ungleich behandelt.'],
[3,'Eine Zulassungsstelle bevorzugt einzelne Antragsteller willkürlich.'],
[4,'Der Staat schränkt einen Gottesdienst ein.'],
[4,'Eine Schule verbietet das Gebet in der Pause.'],
[5,'Die Verwaltung unterbindet eine Presseäußerung.'],
[5,'Eine Behörde zensiert einen kritischen Zeitungsbeitrag.'],
[6,'Die Behörde greift ohne Begründung in das Sorgerecht ein.'],
[6,'Ein Kind wird ohne Prüfung von seinen Sorgeberechtigten getrennt.'],
[8,'Ein Protestzug wird ohne erkennbaren Anlass aufgelöst.'],
[8,'Eine friedliche Mahnwache wird polizeilich verboten.'],
[10,'Eine Behörde kontrolliert unerlaubt den Briefverkehr.'],
[10,'Ein Geheimdienst hört private Anrufe mit.'],
[12,'Eine berufliche Tätigkeit wird pauschal untersagt.'],
[12,'Die Stadt verweigert einer Ärztin ohne Grundlage die Berufszulassung.'],
[13,'Eine Hausdurchsuchung wird ohne gerichtliche Anordnung durchgeführt.'],
[13,'Polizisten dringen in ein Apartment ein.'],
[null,'Eine Privatperson schreibt eine negative Restaurantbewertung.'],
[null,'Die Gemeinde repariert einen beschädigten Gehweg.'],
[null,'Die Stadt erneuert ihre Abfallbehälter.'],
[null,'Ein Nachbar verkauft sein altes Fahrrad.']
];
const rows=examples.map(([expected,facts],i)=>({id:`HOLD-${i+1}`,expected,facts,baseline:detect(facts,false),candidate:detect(facts,true)}));
const out={kind:'POST_FREEZE_SYNTHETIC_HOLDOUT',warning:'New authored paraphrases; not independently adjudicated, not legal reasoning or autonomous learning',total:rows.length,baselineCorrect:rows.filter(x=>x.baseline===x.expected).length,candidateCorrect:rows.filter(x=>x.candidate===x.expected).length,promotionAllowed:false,rows};
writeFileSync('/tmp/nyxa-law-school-holdout.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({total:out.total,baselineCorrect:out.baselineCorrect,candidateCorrect:out.candidateCorrect,failures:rows.filter(x=>x.candidate!==x.expected).map(x=>x.id)},null,2));
