import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer,createConnection} from 'node:net';
const script=resolve('scripts/nyxa-run-test-sandbox.sh');
async function trial(){
 const root=await mkdtemp(join(tmpdir(),'nyxa-online-root-'));
 const outside=await mkdtemp(join(tmpdir(),'nyxa-online-host-'));
 const scratch=join(root,'scratch');await mkdir(scratch);
 const socket=join(outside,'late.sock');let tcp,unix,child,timer;
 try{
  tcp=createServer(s=>s.end('OWNED_TCP'));
  await new Promise(r=>tcp.listen(0,'127.0.0.1',r));
  const port=tcp.address().port;
  const program=`
   const fs=require('fs'),net=require('net');
   if(fs.readdirSync('/sys').length!==0)throw Error('host sysfs visible');
   if(fs.statfsSync('/sys').type!==0x01021994)throw Error('visible sys not tmpfs');
   const line=fs.readFileSync('/proc/self/mountinfo','utf8').split('\\n').find(l=>l.split(' ')[4]==='/sys'&&l.includes(' - tmpfs '));
   if(!line)throw Error('sys mask metadata absent');
   for(const flag of ['ro','nosuid','nodev','noexec'])if(!line.split(' ')[5].split(',').includes(flag))throw Error('missing '+flag);
   let ro=false;try{fs.writeFileSync('/sys/NYXA_MUST_NOT_EXIST','bad')}catch(e){ro=e.code==='EROFS'}
   if(!ro)throw Error('sys write not EROFS');
   const status=fs.readFileSync('/proc/self/status','utf8');
   const fields=Object.fromEntries(status.trim().split('\\n').map(l=>{const i=l.indexOf(':');return[l.slice(0,i),l.slice(i+1).trim()]}));
   for(const cap of ['CapInh','CapPrm','CapEff','CapBnd','CapAmb'])if(BigInt('0x'+fields[cap])!==0n)throw Error('capability survived');
   if(fields.NoNewPrivs!=='1')throw Error('NNP absent');
   console.log('READY');
   process.stdin.once('data',()=>{
    let unixDenied=false,tcpAllowed=false;
    const u=net.createConnection(${JSON.stringify(socket)});
    u.on('error',e=>{unixDenied=e.code==='EPERM';finish()});
    const t=net.createConnection({host:'127.0.0.1',port:${port}});
    t.on('data',b=>{tcpAllowed=b.toString()==='OWNED_TCP';t.destroy();finish()});
    t.on('error',()=>process.exit(1));
    function finish(){if(unixDenied&&tcpAllowed){console.log('SYS_MASKED_RO_TCP_ALLOWED_UNIX_DENIED');process.exit(0)}}
   });setTimeout(()=>process.exit(2),8000);
  `;
  await writeFile(join(root,'probe.cjs'),program);
  child=spawn(script,[scratch,'65536','2097152','64','10','net',root,'--','/usr/bin/node','probe.cjs'],{cwd:root});
  let stdout='',stderr='',hostControl=false,started=false;
  child.stderr.on('data',b=>stderr+=b);
  child.stdout.on('data',b=>{
   stdout+=b;
   if(stdout.includes('READY\n')&&!started){
    started=true;unix=createServer(s=>s.end());unix.on('error',e=>stderr+=e.message);
    unix.listen(socket,()=>{const c=createConnection(socket);c.on('connect',()=>{hostControl=true;c.destroy();child.stdin.write('GO\n')});c.on('error',e=>stderr+=e.message);});
   }
  });
  timer=setTimeout(()=>child.kill('SIGKILL'),20000);
  const code=await new Promise(r=>child.on('close',r));
  assert.equal(code,0,JSON.stringify({stdout,stderr}));
  assert.equal(hostControl,true,'owned host Unix socket really accepts connections');
  assert.match(stdout,/SYS_MASKED_RO_TCP_ALLOWED_UNIX_DENIED/);
 }finally{
  clearTimeout(timer);child?.kill('SIGKILL');
  if(unix)await new Promise(r=>unix.close(r));
  if(tcp)await new Promise(r=>tcp.close(r));
  await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});
 }
}
test('online namespace: shared TCP route, empty read-only sysfs mask, no capabilities, late host Unix deny',async()=>{
 await trial();await Promise.all([trial(),trial()]);
});
test('online namespace: failed sysfs mask prevents target execution',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nyxa-sysmask-failure-'));
 try{
  await writeFile(join(root,'mount'),'#!/bin/sh\nfor arg do\n if [ "$arg" = "/sys" ]; then exit 1; fi\ndone\nexec /usr/bin/mount "$@"\n',{mode:0o755});
  const r=spawnSync(script,[root,'65536','2097152','64','10','net','-','--','/bin/echo','TARGET_MUST_NOT_RUN'],{encoding:'utf8',env:{PATH:root+':/usr/sbin:/usr/bin:/sbin:/bin'}});
  assert.equal(r.status,92,r.stderr);assert.match(r.stderr,/sandbox_mount_setup_failed:sys_mask/);assert.equal(r.stdout,'');
 }finally{await rm(root,{recursive:true,force:true});}
});
