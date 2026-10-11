
const fs=require('fs'),cp=require('child_process');
const s=process.env.NYXA_SANDBOX_SCRATCH;
if(!s)throw Error('scratch required');
const o=s+'/dist';
fs.mkdirSync(o,{recursive:true});
function run(e,a){
 const r=cp.spawnSync(e,a,{stdio:'inherit'});
 if(r.error)throw r.error;
 if(r.status!==0)process.exit(r.status??1);
}
run('/usr/bin/node',['node_modules/typescript/bin/tsc',
 '-p','tsconfig.json','--outDir',o]);
run('/usr/bin/cc',['-std=c11','-O2','-Wall','-Wextra',
 '-Werror','-fstack-protector-strong','-D_FORTIFY_SOURCE=2',
 '-Wl,-z,relro,-z,now','scripts/nyxa-sandbox-filter.c',
 '-o',o+'/nyxa-sandbox-filter']);
for(const f of ['index.js','server.js','nyxa-sandbox-filter'])
 fs.accessSync(o+'/'+f);
console.log('BUILD_EMIT_VERIFIED');
