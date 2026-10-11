import hashlib,json,os,shutil,socket,subprocess,tempfile,uuid
from pathlib import Path
assert socket.gethostname().split('.')[0]=='ubuntu-4gb-nbg1-1'
p=Path('/opt/nyxa-governed-memory-mcp-runtime/config/connector.chatgpt-dev.json')
build=Path('/opt/nyxa-governed-memory-mcp-dev/scripts/nyxa-scratch-build-v2.cjs')
digest=hashlib.sha256(build.read_bytes()).hexdigest()
assert digest=='656c4d96a8c4382e7f3ffbe4de6a9a37014f956ff49508714a02c80db7c18683'
old=p.read_bytes()
c=json.loads(old)
ts=[t for t in c['testTargets'] if t['id']=='build']
assert len(ts)==1
t=ts[0]
prior='/opt/nyxa-governed-memory-mcp-dev/scripts/nyxa-scratch-build.cjs'
assert t['executable']=='/usr/bin/node'
assert t['cwd']=='/opt/nyxa-governed-memory-mcp-dev'
assert t['args']==[prior],'Konfiguration hat sich geaendert'
assert t['integrityFiles']==[{'path':prior,'sha256':'2762e2fc64d59b1ebd1197dae784520a85c087574b30c268178efce6094e1199'}]
t['args']=[str(build)]
t['integrityFiles']=[{'path':str(build),'sha256':digest}]
st=p.stat()
fd,tmp=tempfile.mkstemp(dir=p.parent,prefix='.build-finalize-')
try:
 with os.fdopen(fd,'w') as f:
  json.dump(c,f,indent=2)
  f.write('\n')
  f.flush()
  os.fsync(f.fileno())
 check="import {loadConnectorConfig} from '/opt/nyxa-governed-memory-mcp-runtime/dist/connector/config.js';loadConnectorConfig(process.argv[1]);console.log('CONFIG_VALIDATED');"
 subprocess.run(['/usr/bin/node','--input-type=module','-e',check,tmp],check=True)
 os.chown(tmp,st.st_uid,st.st_gid)
 os.chmod(tmp,st.st_mode & 0o777)
 backup=Path(str(p)+'.backup-finalize-'+uuid.uuid4().hex)
 shutil.copy2(p,backup)
 assert p.read_bytes()==old,'Parallele Aenderung: Abbruch'
 os.replace(tmp,p)
 print('CONFIG_FINALIZED; Sicherung:',backup)
finally:
 if os.path.exists(tmp):os.unlink(tmp)
