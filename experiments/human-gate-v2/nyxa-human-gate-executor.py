#!/usr/bin/python3 -I
import datetime, fcntl, hashlib, json, os, re, shutil, socket, subprocess, sys, tempfile, time
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature

HOST='ubuntu-4gb-nbg1-1'
ISSUED=Path('/var/lib/sentinelx/uploads/nyxa-passkey-v1/data/authority-grants/issued')
STATE=Path('/var/lib/nyxa-human-gate-v2')
PUBLIC_KEY=Path('/etc/nyxa/human-gate-public.pem')
ARTIFACT=Path('/opt/nyxa-governed-memory-mcp-dev/experiments/jeff-gate-isolated/dist/server.js')
RUNTIME=Path('/opt/nyxa-governed-memory-mcp-runtime/dist/server.js')
SERVICE='nyxa-governed-memory-mcp.service'
ACTION='deploy_nyxa_governed_memory_gateway'
TARGET=SERVICE
AUDIT=Path('/var/log/nyxa-human-gate-v2.jsonl')
UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',re.I)

def canonical(v):
 if isinstance(v,dict): return '{'+','.join(json.dumps(k,separators=(',',':'))+':'+canonical(v[k]) for k in sorted(v))+'}'
 if isinstance(v,list): return '['+','.join(canonical(x) for x in v)+']'
 if v is True:return 'true'
 if v is False:return 'false'
 if v is None:return 'null'
 return json.dumps(v,separators=(',',':'))
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def event(phase,claims=None,**extra):
 rec={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':phase,**extra}
 if claims:rec.update({'grant_id':claims.get('grant_id'),'audit_correlation':claims.get('audit_correlation'),'action':claims.get('action'),'target':claims.get('target'),'artifact_sha256':claims.get('artifact_sha256')})
 with AUDIT.open('a') as f:f.write(json.dumps(rec,separators=(',',':'))+'\n');f.flush();os.fsync(f.fileno())
def run(argv,timeout=30):return subprocess.run(argv,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin'},timeout=timeout,text=True,capture_output=True)
def fail(msg):raise RuntimeError(msg)

def main():
 if os.geteuid()!=0 or os.environ.get('SUDO_USER') not in ('sentinelx','jo'):fail('DENY: caller')
 if socket.gethostname().split('.')[0]!=HOST:fail('DENY: target')
 if len(sys.argv)!=3 or sys.argv[1]!='deploy-memory-gateway' or not UUID.fullmatch(sys.argv[2]):fail('DENY: operation')
 grant_id=sys.argv[2];STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
 for name in ('claimed','consumed','rejected','backups'): (STATE/name).mkdir(mode=0o700,exist_ok=True)
 with (STATE/'executor.lock').open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:fail('DENY: concurrent execution')
  src=ISSUED/f'{grant_id}.json';claimed=STATE/'claimed'/f'{grant_id}.json'
  try:os.rename(src,claimed)
  except FileNotFoundError:fail('DENY: grant unavailable, revoked, consumed, or unknown')
  claims=None;backup=None;installed=False
  try:
   st=claimed.lstat()
   if not claimed.is_file() or st.st_nlink!=1 or st.st_size>16384:fail('DENY: grant file')
   envelope=json.loads(claimed.read_text())
   if set(envelope)!=set(('claims','signature','algorithm')) or envelope['algorithm']!='Ed25519':fail('DENY: envelope')
   claims=envelope['claims'];pub=serialization.load_pem_public_key(PUBLIC_KEY.read_bytes())
   import base64
   sig=envelope['signature'];sig+= '='*((4-len(sig)%4)%4)
   try:pub.verify(base64.urlsafe_b64decode(sig),canonical(claims).encode())
   except (InvalidSignature,ValueError):fail('DENY: signature')
   required={'schema','grant_id','issuer','principal','credential_fingerprint','action','target','artifact_sha256','artifact_path','nonce','issued_at','expires_at','max_executions','audit_correlation','transaction_digest','user_verification','origin','rp_id'}
   if set(claims)!=required or claims['schema']!='nyxa-human-authority-grant-v2' or claims['grant_id']!=grant_id:fail('DENY: claims')
   now=int(time.time())
   if claims['action']!=ACTION or claims['target']!=TARGET or claims['artifact_path']!=str(ARTIFACT) or claims['max_executions']!=1 or claims['user_verification'] is not True:fail('DENY: scope')
   if not isinstance(claims['issued_at'],int) or not isinstance(claims['expires_at'],int) or claims['issued_at']>now+30 or claims['expires_at']<now or claims['expires_at']-claims['issued_at']>300:fail('DENY: expiry')
   actual=digest(ARTIFACT)
   if actual!=claims['artifact_sha256']:fail('DENY: artifact checksum')
   consumed=STATE/'consumed'/f'{grant_id}.json'
   fd=os.open(consumed,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
   os.write(fd,json.dumps({'consumed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'claims_digest':hashlib.sha256(canonical(claims).encode()).hexdigest()}).encode());os.fsync(fd);os.close(fd)
   event('grant_consumed',claims)
   stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup=STATE/'backups'/f'server.js.{stamp}.{digest(RUNTIME)}'
   shutil.copy2(RUNTIME,backup);event('backup_created',claims,backup=str(backup),previous_sha256=digest(backup))
   fd,tmp=tempfile.mkstemp(prefix='.server.js.',dir=RUNTIME.parent);os.close(fd);shutil.copyfile(ARTIFACT,tmp);runtime_stat=RUNTIME.stat();os.chown(tmp,runtime_stat.st_uid,runtime_stat.st_gid);os.chmod(tmp,0o644)
   with open(tmp,'rb') as f:os.fsync(f.fileno())
   os.replace(tmp,RUNTIME);installed=True;event('artifact_installed',claims)
   restarted=run(['/usr/bin/systemctl','restart',SERVICE]);
   if restarted.returncode:fail('service restart failed')
   active=run(['/usr/bin/systemctl','is-active','--quiet',SERVICE]);
   if active.returncode:fail('service inactive')
   health=run(['/usr/bin/curl','-fsS','--max-time','5','http://127.0.0.1:18743/health'])
   if health.returncode:fail('gateway health failed')
   event('deployment_success',claims,runtime_sha256=digest(RUNTIME),service_active=True)
   os.replace(claimed,STATE/'consumed'/f'{grant_id}.grant.json')
   print(json.dumps({'ok':True,'grant_id':grant_id,'audit_correlation':claims['audit_correlation'],'runtime_sha256':digest(RUNTIME)}))
  except Exception as exc:
   rollback='not_required'
   if claims and installed and backup and backup.exists():
    try:
     shutil.copy2(backup,RUNTIME);run(['/usr/bin/systemctl','restart',SERVICE]);rollback='successful' if run(['/usr/bin/systemctl','is-active','--quiet',SERVICE]).returncode==0 and digest(RUNTIME)==digest(backup) else 'failed'
    except Exception:rollback='failed'
   event('deployment_failed',claims,error=str(exc)[:240],rollback=rollback)
   if claimed.exists():os.replace(claimed,STATE/'rejected'/claimed.name)
   raise
if __name__=='__main__':main()
