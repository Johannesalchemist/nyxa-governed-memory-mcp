import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer,createConnection} from 'node:net';
import {performance} from 'node:perf_hooks';
const script=resolve('scripts/nyxa-run-test-sandbox.sh');
const helper=resolve('dist/nyxa-sandbox-filter');
async function socketTrial(mode,scope){
 const root=await mkdtemp(join(tmpdir(),'nyxa-boundary-root-'));
 const outside=await mkdtemp(join(tmpdir(),'nyxa-boundary-outside-'));
 const scratch=join(root,'scratch');await mkdir(scratch);
 const sock=join(scope==='snapshot'?root:outside,'late.sock');
 const program=`
  const net=require('net'),fs=require('fs');
  const start=Date.now();let attempts=0;
  const watchers=fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p)&&+p!==1&&+p!==process.pid).filter(p=>{
   try{return fs.readFileSync('/proc/'+p+'/comm','utf8').trim()==='bash'&&fs.readFileSync('/proc/'+p+'/cmdline','utf8').includes('sandbox-inner')}catch{return false}
  });
  for(const p of watchers){try{process.kill(+p,'SIGKILL')}catch{}}
  console.log(JSON.stringify({phase:'ready',watchers}));
  function attempt(){attempts++;const s=net.createConnection(${JSON.stringify(sock)});
   s.on('connect',()=>{console.log(JSON.stringify({outcome:'ALLOWED'}));s.destroy();process.exit(1)});
   s.on('error',e=>{s.destroy();if(Date.now()-start>=1200){console.log(JSON.stringify({outcome:'DENIED',code:e.code,attempts,observation_ms:Date.now()-start}));process.exit(0)}else setTimeout(attempt,5)});
  }attempt();`;
 await writeFile(join(root,'probe.cjs'),program);
 let server,readyMs,hostControl=false,stdout='',stderr='',buffer='';
 const start=performance.now();
 const child=spawn(script,[scratch,'65536','2097152','64','10',mode,root,'--','/usr/bin/node','probe.cjs'],{cwd:root,env:{PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8'}});
 const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
 child.stderr.on('data',b=>stderr+=b);
 child.stdout.on('data',b=>{
  stdout+=b;buffer+=b;
  while(buffer.includes('\n')){const i=buffer.indexOf('\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+1);
   let msg;try{msg=JSON.parse(line)}catch{continue}
   if(msg.phase==='ready'&&!server){readyMs=performance.now()-start;
    server=createServer(s=>s.end());server.on('error',e=>stderr+='HOST_ERROR '+e.message);
    server.listen(sock,()=>{const control=createConnection(sock);control.on('connect',()=>{hostControl=true;control.destroy()});control.on('error',()=>{});});
   }
  }
 });
 try{
  const exit=await new Promise(r=>child.on('close',(code,signal)=>r({code,signal})));
  assert.equal(exit.code,0,JSON.stringify({exit,stdout,stderr}));
  const rows=stdout.trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(rows[0].phase,'ready');assert.deepEqual(rows[0].watchers,[],'no privileged masking watcher remains available to the target');
  assert.equal(hostControl,true,'control proves the real host socket accepts connections');
  assert.equal(rows[1].outcome,'DENIED');assert.equal(rows[1].code,'EPERM');
  assert.ok(rows[1].observation_ms>=1200);
  console.log(JSON.stringify({mode,scope,initialization_ms:readyMs,host_control:hostControl,...rows[1]}));
 }finally{
  clearTimeout(timer);child.kill('SIGKILL');
  if(server)await new Promise(r=>server.close(r));
  await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});
 }
}
test('socket boundary: post-start host sockets denied, with repeated and concurrent targets',async()=>{
 for(let i=0;i<2;i++)await socketTrial('nonet','outside');
 await Promise.all([socketTrial('nonet','outside'),socketTrial('nonet','snapshot')]);

});
test('socket boundary: filter absent refuses target execution',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nyxa-filter-missing-'));
 try{
  await mkdir(join(root,'scripts'));await mkdir(join(root,'dist'));
  const copy=join(root,'scripts','sandbox.sh');await copyFile(script,copy);
  const result=spawnSync(copy,[root,'65536','2097152','64','10','nonet','-','--','/bin/echo','TARGET_MUST_NOT_RUN'],{encoding:'utf8'});
  assert.equal(result.status,96,result.stderr);assert.match(result.stderr,/sandbox_filter_unavailable/);assert.doesNotMatch(result.stdout,/TARGET_MUST_NOT_RUN/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('socket boundary: actual script mount failure refuses target execution',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nyxa-mount-failure-'));
 try{
  await writeFile(join(root,'mount'),'#!/bin/sh\nexit 1\n',{mode:0o755});
  const result=spawnSync(script,[root,'65536','2097152','64','10','nonet','-','--','/bin/echo','TARGET_MUST_NOT_RUN'],{encoding:'utf8',env:{PATH:root+':/usr/sbin:/usr/bin:/sbin:/bin'}});
  assert.equal(result.status,92,result.stderr);assert.match(result.stderr,/sandbox_mount_setup_failed:rprivate/);assert.doesNotMatch(result.stdout,/TARGET_MUST_NOT_RUN/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('socket boundary: Unix listening and ordinary child-process stdio remain usable offline',()=>{
 const result=spawnSync(helper,['nonet','--','/usr/bin/node','-e',`
  const {spawnSync}=require('child_process');const r=spawnSync('/bin/echo',['IPC_OK'],{encoding:'utf8'});
  if(r.status!==0||r.stdout.trim()!=='IPC_OK')process.exit(1);
  const net=require('net');const s=net.createServer();s.listen({path:'\\0nyxa-isolated-'+process.pid},()=>s.close(()=>console.log('PASS')));
 `],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'PASS');
});

test('socket boundary: a denied WriterLock liveness probe preserves the live lock',()=>{
 const module=new URL('../dist/audit/WriterLock.js',import.meta.url).href;
 const result=spawnSync(helper,['nonet','--','/usr/bin/node','--input-type=module','-e',`
  import {mkdtemp,rm,lstat} from 'node:fs/promises';
  import {tmpdir} from 'node:os';import {join} from 'node:path';
  import {WriterLock} from ${JSON.stringify(module)};
  const root=await mkdtemp(join(tmpdir(),'nyxa-filter-lock-'));
  const a=new WriterLock(root),b=new WriterLock(root);
  try{await a.acquire();const before=await lstat(join(root,'.writer.lock.sock'));let acquired=false,reason;
   try{await b.acquire();acquired=true}catch(e){reason=e.message}
   const after=await lstat(join(root,'.writer.lock.sock'));
   console.log(JSON.stringify({acquired,reason,same_inode:before.ino===after.ino}));
  }finally{await b.release();await a.release();await rm(root,{recursive:true,force:true});}
 `],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const outcome=JSON.parse(result.stdout);
 assert.equal(outcome.acquired,false);assert.equal(outcome.same_inode,true);
 assert.match(outcome.reason,/writer_lock_probe_uncertain:EPERM/);
});
test('socket boundary: online filter denies Unix creation but allows an owned TCP endpoint',async()=>{
 const {createServer:tcpServer}=await import('node:net');
 const server=tcpServer(s=>s.end('OWNED_ENDPOINT'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;
 try{
  const child=spawn(helper,['net','--','/usr/bin/node','-e',`
   const net=require('net');let denied=false,allowed=false;
   const u=net.createConnection('/tmp/nyxa-does-not-exist');
   u.on('error',e=>{denied=e.code==='EPERM';finish()});
   const t=net.createConnection({host:'127.0.0.1',port:${port}});
   t.on('data',b=>{allowed=b.toString()==='OWNED_ENDPOINT';t.destroy();finish()});
   t.on('error',()=>process.exit(1));
   function finish(){if(denied&&allowed){console.log('TCP_ALLOWED_UNIX_DENIED');process.exit(0)}}setTimeout(()=>process.exit(1),2000);
  `]);
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const code=await new Promise(r=>child.on('close',r));
  assert.equal(code,0,stderr);assert.equal(stdout.trim(),'TCP_ALLOWED_UNIX_DENIED');
 }finally{await new Promise(r=>server.close(r));}
});

test('socket boundary: native syscall, socketpair, io_uring and alternative ABI checks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nyxa-native-filter-'));
 try{
  const executable=join(root,'probe');
  const build=spawnSync('/usr/bin/cc',['-Wall','-Wextra','-Werror',resolve('tests/native-socket-probe.c'),'-o',executable],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const online=spawnSync(helper,['net','--',executable],{encoding:'utf8'});
  assert.equal(online.status,0,online.stderr);
  const result=JSON.parse(online.stdout);
  assert.equal(result.unix_socket,-1);assert.equal(result.unix_errno,1);
  assert.equal(result.unix_pair,-1);assert.equal(result.pair_errno,1);
  assert.ok(result.inet_socket>=0);
  assert.equal(result.ring,-1);assert.equal(result.ring_errno,1);
  const offline=spawnSync(helper,['nonet','--',executable],{encoding:'utf8'});
  assert.equal(offline.status,0,offline.stderr);
  const ipc=JSON.parse(offline.stdout);assert.ok(ipc.unix_socket>=0);assert.equal(ipc.unix_pair,0);
  if(process.arch==='x64'){
   for(const abi of ['x32','compat']){
    const probe=spawnSync(helper,['nonet','--',executable,abi],{encoding:'utf8'});
    assert.equal(probe.signal,'SIGSYS',JSON.stringify(probe));
   }
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
