// Constrained, auditable element checking on five synthetic constitutional scenarios.
// This is rule-based element matching, not a court-level proportionality analysis.
import {readFileSync,writeFileSync} from 'node:fs';
const docs=new Map(JSON.parse(readFileSync('/tmp/nyxa-elm001-extracted-evidence.json','utf8')).results.filter(x=>x.extracted).map(x=>[x.article,x]));
const cases=[
 {id:'T1',article:8,facts:'Deutsche Bürger versammeln sich friedlich und ohne Waffen. Die Polizei verbietet die Versammlung.',elements:[['friedlich',/friedlich/i],['ohne Waffen',/ohne Waffen/i],['staatliche Maßnahme',/Polizei verbietet/i]]},
 {id:'T2',article:5,facts:'Eine Behörde verbietet die öffentliche Äußerung einer politischen Meinung.',elements:[['Meinungsäußerung',/politischen Meinung/i],['staatliche Maßnahme',/Behörde verbietet/i]]},
 {id:'T3',article:13,facts:'Beamte betreten eine Privatwohnung gegen den Willen der Bewohner.',elements:[['Wohnung',/Privatwohnung/i],['staatliche Maßnahme',/Beamte betreten/i]]},
 {id:'T4',article:3,facts:'Eine Behörde entscheidet bei zwei vergleichbaren Anträgen unterschiedlich.',elements:[['Vergleichsgruppe',/vergleichbaren Anträgen/i],['staatliche Maßnahme',/Behörde entscheidet/i]]},
 {id:'T5',article:12,facts:'Eine staatliche Stelle untersagt einer Bäckerin die Ausübung ihres Berufs.',elements:[['Berufsbezug',/Ausübung ihres Berufs/i],['staatliche Maßnahme',/staatliche Stelle untersagt/i]]}
];
const outputs=cases.map(c=>{
 const doc=docs.get(c.article);
 const elements=c.elements.map(([name,re])=>({name,found:re.test(c.facts),basis:'FACT_TEXT_PATTERN',matched:c.facts.match(re)?.[0]??null}));
 const cite=doc?.paragraphs?.[0];
 return {id:c.id,article:c.article,elements,sourceCitation:cite?{url:doc.url,sourceSha256:doc.sourceSha256,paragraph:cite.paragraph,exactText:cite.text}:null,elementChecksPassed:elements.every(x=>x.found),justificationAssessed:false,proportionalityAssessed:false,legalConclusion:'UNDETERMINED',epistemicAuthority:'NONE',promotionAllowed:false};
});
const out={kind:'RULE_BASED_FACT_TO_ELEMENT_TRACES',warning:'Patterns selected from authored scenarios; not independent legal subsumption or validated constitutional judgment',total:outputs.length,allElementsFound:outputs.filter(x=>x.elementChecksPassed).length,sourceCited:outputs.filter(x=>x.sourceCitation).length,legalConclusions:0,outputs};
writeFileSync('/tmp/nyxa-law-school-subsumption.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({total:out.total,allElementsFound:out.allElementsFound,sourceCited:out.sourceCited,legalConclusions:out.legalConclusions},null,2));
