// Adversarial paraphrase and legal uncertainty probe against the introductory issue spotter.
// Independent wording, no claims of full constitutional analysis.
import {writeFileSync} from 'node:fs';
const patterns=[[/bloße Objekte/,1],[/private Handlung/,2],[/vergleichbare Personen/,3],[/religiöse/,4],[/politischen Meinung/,5],[/Familie/,6],[/Demonstration/,8],[/Nachrichten/,10],[/Berufs/,12],[/Privatwohnung/,13]];
const detect=s=>patterns.find(([p])=>p.test(s))?.[1]??null;
const cases=[
[1,'Die Verwaltung erniedrigt einen Gefangenen gezielt und stellt ihn öffentlich zur Schau.'],
[2,'Die Stadt untersagt einer Person das harmlose nächtliche Spazierengehen.'],
[3,'Zwei gleich gelagerte Anträge werden von der Behörde ohne Begründung unterschiedlich beschieden.'],
[4,'Eine Gemeinde verbietet das Tragen eines Glaubenssymbols in einer öffentlichen Einrichtung.'],
[5,'Die Stadtverwaltung verbietet ein kritisches Flugblatt über den Bürgermeister.'],
[6,'Eine Behörde trennt Eltern und Kind ohne nachvollziehbare Begründung.'],
[8,'Die Polizei verbietet eine friedliche Kundgebung auf dem Marktplatz.'],
[10,'Ein Amt überwacht ohne Befugnis vertrauliche Telefonate.'],
[12,'Einer Bäckerin wird ohne Begründung die Ausübung ihres Gewerbes untersagt.'],
[13,'Beamte durchsuchen ohne Einwilligung die Wohnung eines Bürgers.'],
[null,'Die Stadt beschließt, die Straßenlaternen früher einzuschalten.'],
[null,'Eine Privatperson kritisiert den Kleidungsstil einer anderen Person.']
];
const outcomes=cases.map(([expected,facts],i)=>({id:`RED-${i+1}`,facts,expected,predicted:detect(facts),correct:expected===detect(facts)}));
const out={kind:'LAW_SCHOOL_ADVERSARIAL_PARAPHRASE',note:'Held-out wording tests keyword recognizer, not independent human legal assessment',total:outcomes.length,correct:outcomes.filter(x=>x.correct).length,failures:outcomes.filter(x=>!x.correct),outcomes};
writeFileSync('/tmp/nyxa-law-school-redteam.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({total:out.total,correct:out.correct,failures:out.failures.map(x=>({id:x.id,expected:x.expected,predicted:x.predicted}))},null,2));
