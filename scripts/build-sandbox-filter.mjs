import {spawnSync} from 'node:child_process';
import {mkdirSync,renameSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('./nyxa-sandbox-filter.c',import.meta.url));
const output=fileURLToPath(new URL('../dist/nyxa-sandbox-filter',import.meta.url));
mkdirSync(fileURLToPath(new URL('../dist/',import.meta.url)),{recursive:true});
const temporary=output+'.tmp-'+process.pid;
const result=spawnSync('/usr/bin/cc',['-std=c11','-O2','-Wall','-Wextra','-Werror','-fstack-protector-strong','-D_FORTIFY_SOURCE=2','-Wl,-z,relro,-z,now',source,'-o',temporary],{stdio:'inherit'});
if(result.error||result.status!==0){rmSync(temporary,{force:true});throw result.error??new Error('sandbox_filter_build_failed');}
renameSync(temporary,output);
