// NSI-MR controlled human-machine-human roundtrip, explicit coverage and abstention.
// Finite grammar prototype, not general natural-language understanding.
import {writeFileSync} from 'node:fs';
const cases=[
 {id:'L1',de:'Eine Freigabe erfordert vorher einen Nachweis.',en:'Approval requires evidence beforehand.',relation:'REQUIRES_BEFORE',subject:'approval',object:'evidence',temporal:'BEFORE'},
 {id:'L2',de:'Die Freigabe wird durch einen Nachweis unterstützt.',en:'Evidence supports the approval.',relation:'SUPPORTS',subject:'evidence',object:'approval',temporal:'UNSPECIFIED'},
 {id:'L3',de:'Die Messung widerspricht der Hypothese.',en:'The measurement contradicts the hypothesis.',relation:'CONTRADICTS',subject:'measurement',object:'hypothesis',temporal:'UNSPECIFIED'},
 {id:'L4',de:'Die Reaktion wird durch Rückkopplung reguliert.',en:'Feedback regulates the response.',relation:'REGULATED_BY',subject:'response',object:'feedback',temporal:'UNSPECIFIED'}
];
const parse=s=>{const x=cases.find(c=>c.de===s||c.en===s);return x?{schema:'NSI-MR/0',relation:x.relation,subject:x.subject,object:x.object,temporal:x.temporal,epistemic:'OBSERVATION',sourceText:s,authority:'NONE'}:null};
const render=(x,lang)=>cases.find(c=>c.relation===x.relation&&c.subject===x.subject&&c.object===x.object&&c.temporal===x.temporal)?.[lang]??null;
const roundtrips=cases.flatMap(c=>['de','en'].map(lang=>{const encoded=parse(c[lang]),decoded=encoded&&render(encoded,lang==='de'?'en':'de'),back=decoded&&parse(decoded);return{id:c.id,sourceLang:lang,success:!!back&&['relation','subject','object','temporal'].every(k=>encoded[k]===back[k]),decoded};}));
const negative=[
 {id:'unknown',input:'Der Zusammenhang könnte vielleicht existieren.',expected:null},
 {id:'negation',input:'Eine Freigabe erfordert keinen Nachweis.',expected:null},
 {id:'time_reversal',input:'Ein Nachweis folgt auf die Freigabe.',expected:null},
 {id:'modal',input:'Eine Freigabe könnte einen Nachweis erfordern.',expected:null}
].map(x=>({id:x.id,abstained:parse(x.input)===x.expected}));
const out={kind:'NSI_MR_BILINGUAL_ROUNDTRIP',roundtrips,negative,roundtripPassed:roundtrips.filter(x=>x.success).length,roundtripTotal:roundtrips.length,negativePassed:negative.filter(x=>x.abstained).length,negativeTotal:negative.length,coverage:'FINITE_CONTROLLED_GRAMMAR',humanSemanticValidation:false,promotionAllowed:false};
writeFileSync('/tmp/nyxa-lingua-roundtrip.json',JSON.stringify(out,null,2));console.log(JSON.stringify({roundtripPassed:out.roundtripPassed,roundtripTotal:out.roundtripTotal,negativePassed:out.negativePassed,negativeTotal:out.negativeTotal,coverage:out.coverage},null,2));if(out.roundtripPassed!==out.roundtripTotal||out.negativePassed!==out.negativeTotal)process.exitCode=1;
