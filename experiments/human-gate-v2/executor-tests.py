#!/usr/bin/python3
import base64, datetime, importlib.util, json, os, sys, tempfile, types
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

SOURCE=Path(__file__).with_name('nyxa-human-gate-executor.py')
spec=importlib.util.spec_from_file_location('executor',SOURCE);ex=importlib.util.module_from_spec(spec);spec.loader.exec_module(ex)
tmp=Path(tempfile.mkdtemp(prefix='nyxa-executor-test.'))
ex.ISSUED=tmp/'issued';ex.STATE=tmp/'state';ex.PUBLIC_KEY=tmp/'public.pem';ex.ARTIFACT=tmp/'artifact.js';ex.RUNTIME=tmp/'runtime.js';ex.AUDIT=tmp/'audit.jsonl'
ex.ISSUED.mkdir();ex.ARTIFACT.write_text('new build');ex.RUNTIME.write_text('old build')
private=Ed25519PrivateKey.generate();ex.PUBLIC_KEY.write_bytes(private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
ex.os.geteuid=lambda:0;ex.os.chown=lambda *args:None;ex.socket.gethostname=lambda:'ubuntu-4gb-nbg1-1';os.environ['SUDO_USER']='sentinelx'
okrun=lambda *args,**kwargs:types.SimpleNamespace(returncode=0,stdout='ok',stderr='')
ex.run=okrun

def grant(grant_id,sha=None,expires=None,signature=True):
 now=int(datetime.datetime.now(datetime.timezone.utc).timestamp())
 claims={'schema':'nyxa-human-authority-grant-v2','grant_id':grant_id,'issuer':'webauthn://auth.future24.eu','principal':'nyxa-owner','credential_fingerprint':'f'*64,'action':ex.ACTION,'target':ex.TARGET,'artifact_sha256':sha or ex.digest(ex.ARTIFACT),'artifact_path':str(ex.ARTIFACT),'nonce':'n'*43,'issued_at':now,'expires_at':expires or now+120,'max_executions':1,'audit_correlation':'11111111-1111-4111-8111-111111111111','transaction_digest':'d'*64,'user_verification':True,'origin':'https://auth.future24.eu','rp_id':'auth.future24.eu'}
 sig=private.sign(ex.canonical(claims).encode()) if signature else b'bad'
 (ex.ISSUED/f'{grant_id}.json').write_text(json.dumps({'claims':claims,'signature':base64.urlsafe_b64encode(sig).decode().rstrip('='),'algorithm':'Ed25519'}))

def invoke(grant_id):
 old=sys.argv;sys.argv=['executor','deploy-memory-gateway',grant_id]
 try:return ex.main()
 finally:sys.argv=old

valid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';grant(valid);invoke(valid)
assert ex.RUNTIME.read_text()=='new build'
assert (ex.STATE/'consumed'/f'{valid}.json').exists()
try:invoke(valid);raise AssertionError('replay accepted')
except RuntimeError as e:assert 'grant unavailable' in str(e)

badsha='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';grant(badsha,sha='0'*64);before=ex.RUNTIME.read_text()
try:invoke(badsha);raise AssertionError('bad checksum accepted')
except RuntimeError as e:assert 'checksum' in str(e)
assert ex.RUNTIME.read_text()==before

expired='cccccccc-cccc-4ccc-8ccc-cccccccccccc';grant(expired,expires=1)
try:invoke(expired);raise AssertionError('expired accepted')
except RuntimeError as e:assert 'expiry' in str(e)

bad_sig='dddddddd-dddd-4ddd-8ddd-dddddddddddd';grant(bad_sig,signature=False)
try:invoke(bad_sig);raise AssertionError('signature accepted')
except RuntimeError as e:assert 'signature' in str(e)

rollback='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';ex.RUNTIME.write_text('rollback-old');grant(rollback)
calls=0
def fail_restart(argv,timeout=30):
 global calls
 if argv[:2]==['/usr/bin/systemctl','restart']:
  calls+=1
  return types.SimpleNamespace(returncode=1 if calls==1 else 0,stdout='',stderr='')
 return okrun()
ex.run=fail_restart
try:invoke(rollback);raise AssertionError('failed restart accepted')
except RuntimeError as e:assert 'restart failed' in str(e)
assert ex.RUNTIME.read_text()=='rollback-old'
events=[json.loads(x) for x in ex.AUDIT.read_text().splitlines()]
assert events[-1]['phase']=='deployment_failed' and events[-1]['rollback']=='successful'
print('PASS executor signature, expiry, checksum, single-use, replay denial and verified rollback tests')
