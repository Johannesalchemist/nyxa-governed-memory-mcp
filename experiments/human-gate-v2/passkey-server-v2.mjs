import http from 'node:http';
import { createHash, randomBytes, randomUUID, sign, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const ORIGIN = process.env.NYXA_WEBAUTHN_ORIGIN || 'https://auth.future24.eu';
const RP_ID = process.env.NYXA_WEBAUTHN_RP_ID || 'auth.future24.eu';
const STATE_PATH = process.env.NYXA_PASSKEY_STATE || '/app/data/state.json';
const CATALOG_PATH = process.env.NYXA_TRANSACTION_CATALOG || '/app/data/transactions.json';
const PRIVATE_KEY_PATH = process.env.NYXA_GRANT_PRIVATE_KEY || '/app/data/human-gate-private.pem';
const GRANT_ROOT = process.env.NYXA_GRANT_ROOT || '/app/data/authority-grants';
const BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN;
const MAX_BODY = 50_000;
const CHALLENGE_TTL_MS = Number(process.env.NYXA_CHALLENGE_TTL_MS || 120_000);
const LISTEN_PORT = Number(process.env.NYXA_PASSKEY_PORT || 3457);
const LISTEN_HOST = process.env.NYXA_PASSKEY_HOST || '0.0.0.0';
if (!Number.isInteger(CHALLENGE_TTL_MS) || CHALLENGE_TTL_MS < 1_000 || CHALLENGE_TTL_MS > 300_000) throw Error('invalid_challenge_ttl');
if (!Number.isInteger(LISTEN_PORT) || LISTEN_PORT < 1 || LISTEN_PORT > 65535) throw Error('invalid_listen_port');

const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const b64url = value => Buffer.from(value).toString('base64url');
const safeEq = (a,b) => { if(typeof a!=='string'||typeof b!=='string') return false; const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length&&timingSafeEqual(x,y); };
const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value);
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const exactKeys = (obj, allowed) => obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).every(k => allowed.includes(k));

function loadCatalog() {
  const value = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  if (value?.schema !== 'nyxa-human-gate-transactions-v2' || !Array.isArray(value.transactions)) throw Error('invalid_transaction_catalog');
  const map = new Map();
  for (const tx of value.transactions) {
    if (!exactKeys(tx, ['operation_id','action','target','artifact_sha256','artifact_path','display','ttl_seconds']) ||
        !validId(tx.operation_id) || typeof tx.action !== 'string' || typeof tx.target !== 'string' ||
        !/^[0-9a-f]{64}$/.test(tx.artifact_sha256) || typeof tx.artifact_path !== 'string' ||
        typeof tx.display !== 'string' || !Number.isInteger(tx.ttl_seconds) || tx.ttl_seconds < 30 || tx.ttl_seconds > 300) {
      throw Error('invalid_transaction_catalog');
    }
    if (map.has(tx.operation_id)) throw Error('duplicate_operation_id');
    map.set(tx.operation_id, Object.freeze({...tx}));
  }
  return map;
}

const catalog = loadCatalog();
const privateKey = readFileSync(PRIVATE_KEY_PATH, 'utf8');
let db = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {credentials:[],challenges:{},usedBootstrap:false,audit:[]};
db.credentials ||= [];
db.challenges ||= {};
db.audit ||= [];

function atomicJson(path, value, mode=0o600) {
  mkdirSync(dirname(path), {recursive:true, mode:0o700});
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const fd = openSync(tmp, 'wx', mode);
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(tmp, path);
}
function save() {
  if (db.audit.length > 1000) db.audit = db.audit.slice(-1000);
  atomicJson(STATE_PATH, db);
}
function audit(type, fields={}) {
  db.audit.push({at:new Date().toISOString(), type, ...fields});
  save();
}
function respond(res, status, obj, extra={}) {
  res.writeHead(status, {
    'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
    'x-content-type-options':'nosniff', 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
    ...extra,
  });
  res.end(JSON.stringify(obj));
}
function publicTransaction(tx) {
  return {operation_id:tx.operation_id, action:tx.action, target:tx.target, artifact_sha256:tx.artifact_sha256, display:tx.display, expires_in_seconds:tx.ttl_seconds};
}
function activeCredentials() { return db.credentials.filter(c => c.status !== 'revoked'); }
function credentialFor(response) { return activeCredentials().find(c => c.id === response?.id); }
function consumeChallenge(id, kind) {
  const ch = db.challenges[id];
  if (!ch || ch.kind !== kind) return {error:'challenge_not_found_or_used'};
  delete db.challenges[id];
  save(); // consume before asynchronous signature verification: concurrent replay fails closed
  if (Date.now() > ch.expires) return {error:'challenge_expired'};
  return {challenge:ch};
}
async function authenticationOptions(kind, subject) {
  const credentials = activeCredentials();
  if (!credentials.length) throw Object.assign(Error('no_passkey_registered'), {status:403});
  const options = await generateAuthenticationOptions({
    rpID:RP_ID, userVerification:'required',
    allowCredentials:credentials.map(c => ({id:c.id, transports:c.transports})),
  });
  const approvalId = randomUUID();
  db.challenges[approvalId] = {
    kind, challenge:options.challenge, expires:Date.now()+CHALLENGE_TTL_MS,
    subject, subject_digest:sha256(canonical(subject)),
  };
  save();
  return {approval_id:approvalId, publicKey:options, transaction:subject};
}
async function verifyAuthentication(body, kind) {
  if (!exactKeys(body, ['approval_id','response']) || !validUuid(body.approval_id)) throw Object.assign(Error('invalid_request'), {status:400});
  const claimed = consumeChallenge(body.approval_id, kind);
  if (claimed.error) throw Object.assign(Error(claimed.error), {status:403});
  const credential = credentialFor(body.response);
  if (!credential) throw Object.assign(Error('unknown_credential'), {status:403});
  const result = await verifyAuthenticationResponse({
    response:body.response, expectedChallenge:claimed.challenge.challenge,
    expectedOrigin:ORIGIN, expectedRPID:RP_ID, requireUserVerification:true,
    credential:{id:credential.id, publicKey:Buffer.from(credential.publicKey,'base64url'), counter:credential.counter, transports:credential.transports},
  });
  if (!result.verified || result.authenticationInfo?.userVerified !== true) throw Object.assign(Error('verification_failed'), {status:403});
  credential.counter = result.authenticationInfo.newCounter;
  save();
  return {credential, subject:claimed.challenge.subject, subjectDigest:claimed.challenge.subject_digest};
}
function issueGrant(verified) {
  const tx = verified.subject;
  const now = Math.floor(Date.now()/1000);
  const grantId = randomUUID();
  const claims = {
    schema:'nyxa-human-authority-grant-v2', grant_id:grantId,
    issuer:`webauthn://${RP_ID}`, principal:'nyxa-owner',
    credential_fingerprint:sha256(verified.credential.id),
    action:tx.action, target:tx.target, artifact_sha256:tx.artifact_sha256,
    artifact_path:tx.artifact_path, nonce:b64url(randomBytes(32)),
    issued_at:now, expires_at:now+tx.ttl_seconds, max_executions:1,
    audit_correlation:randomUUID(), transaction_digest:verified.subjectDigest,
    user_verification:true, origin:ORIGIN, rp_id:RP_ID,
  };
  const signature = sign(null, Buffer.from(canonical(claims)), privateKey).toString('base64url');
  const envelope = {claims, signature, algorithm:'Ed25519'};
  const grantPath=join(GRANT_ROOT, 'issued', `${grantId}.json`);
  atomicJson(grantPath, envelope);
  try { audit('grant_issued', {grant_id:grantId, audit_correlation:claims.audit_correlation, action:claims.action, target:claims.target, artifact_sha256:claims.artifact_sha256}); }
  catch(error) { mkdirSync(join(GRANT_ROOT,'failed'),{recursive:true,mode:0o700}); renameSync(grantPath,join(GRANT_ROOT,'failed',`${grantId}.json`)); throw error; }
  return {grant_id:grantId, audit_correlation:claims.audit_correlation, expires_at:new Date(claims.expires_at*1000).toISOString()};
}

const attempts = new Map();
function limited(req) {
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
  const now=Date.now(); let v=attempts.get(ip)||{n:0,until:now+60_000};
  if(now>v.until)v={n:0,until:now+60_000}; v.n++; attempts.set(ip,v); return v.n>20;
}

const page = String.raw`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NYXA Human Gate</title><style>body{font:17px system-ui;max-width:720px;margin:5vh auto;padding:20px;color:#182337}button,input,select{padding:14px;margin:8px 0;font-size:17px;width:100%;box-sizing:border-box}button{background:#182e5e;color:white;border:0;border-radius:8px}button[disabled]{opacity:.5}pre{white-space:pre-wrap;background:#f3f5f9;padding:14px;border-radius:8px}.warn{color:#8a2600}</style><h1>NYXA Human Gate 🔐</h1><p>Eine Anmeldung ist keine Aktionsfreigabe. Jede Aktion wird separat, sichtbar und einmalig mit dem Passkey bestätigt.</p><select id="operation"></select><button id="prepare">Freigabe vorbereiten</button><pre id="tx">Keine Aktion vorbereitet.</pre><button id="approve" disabled>Diese konkrete Aktion mit Passkey freigeben</button><pre id="msg"></pre><details><summary>Erstregistrierung</summary><input id="code" type="password" autocomplete="off" placeholder="Einrichtungscode"><button id="reg">Passkey registrieren</button></details><script>const q=s=>document.querySelector(s),m=q('#msg'),tx=q('#tx'),approve=q('#approve');let pending=null;function b64(x){return Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}function enc(x){return btoa(String.fromCharCode(...new Uint8Array(x))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}async function req(url,body){let r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),x=await r.json();if(!r.ok)throw Error(x.error||'Fehler');return x}async function init(){let r=await fetch('/transactions',{cache:'no-store'}),x=await r.json();for(const t of x.transactions){let o=document.createElement('option');o.value=t.operation_id;o.textContent=t.display;q('#operation').append(o)}}q('#prepare').onclick=async()=>{try{pending=await req('/authorize/options',{operation_id:q('#operation').value});let t=pending.transaction;tx.textContent='AKTION: '+t.action+'\nZIEL: '+t.target+'\nARTEFAKT SHA-256: '+t.artifact_sha256+'\n\n'+t.display;approve.disabled=false;m.textContent='Prüfe die Angaben. Erst der nächste Schritt erteilt das einmalige Mandat.'}catch(e){m.textContent=e.message}};approve.onclick=async()=>{try{approve.disabled=true;let o=pending.publicKey,c=await navigator.credentials.get({publicKey:{...o,challenge:b64(o.challenge),allowCredentials:o.allowCredentials.map(v=>({...v,id:b64(v.id)}))}});let x=await req('/authorize/verify',{approval_id:pending.approval_id,response:{id:c.id,rawId:enc(c.rawId),type:c.type,response:{clientDataJSON:enc(c.response.clientDataJSON),authenticatorData:enc(c.response.authenticatorData),signature:enc(c.response.signature),userHandle:c.response.userHandle?enc(c.response.userHandle):null},clientExtensionResults:c.getClientExtensionResults()}});m.textContent='Freigabe kryptografisch verifiziert. Mandat: '+x.grant_id+'\nAblauf: '+x.expires_at;pending=null}catch(e){m.textContent=e.message}};q('#reg').onclick=async()=>{try{let code=q('#code').value.trim(),o=await req('/register/options',{code}),p={...o,challenge:b64(o.challenge),user:{...o.user,id:b64(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(c=>({...c,id:b64(c.id)}))},c=await navigator.credentials.create({publicKey:p}),x=await req('/register/verify',{code,response:{id:c.id,rawId:enc(c.rawId),type:c.type,response:{clientDataJSON:enc(c.response.clientDataJSON),attestationObject:enc(c.response.attestationObject),transports:c.response.getTransports?.()||[]},clientExtensionResults:c.getClientExtensionResults()}});m.textContent=x.message}catch(e){m.textContent=e.message}};init().catch(e=>m.textContent=e.message)</script></html>`;

http.createServer(async (req,res) => {
  if (req.method==='GET' && req.url==='/') { res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY'}); return res.end(page); }
  if (req.method==='GET' && req.url==='/health') return respond(res,200,{status:'ok',registered:activeCredentials().length>0,mandateIssuance:true,transactionCount:catalog.size});
  if (req.method==='GET' && req.url==='/transactions') return respond(res,200,{transactions:[...catalog.values()].map(publicTransaction)});
  const allowed=['/register/options','/register/verify','/login/options','/login/verify','/authorize/options','/authorize/verify','/revoke/options','/revoke/verify'];
  if(req.method!=='POST'||!allowed.includes(req.url))return respond(res,404,{error:'not_found'});
  if(limited(req))return respond(res,429,{error:'rate_limited'});
  let raw='';
  try {
    for await(const chunk of req){raw+=chunk;if(raw.length>MAX_BODY)throw Object.assign(Error('too_large'),{status:413});}
    const body=JSON.parse(raw||'{}'); const now=Date.now();
    if(req.url.startsWith('/register/')){
      if(db.usedBootstrap||db.credentials.length)return respond(res,403,{error:'registration_closed'});
      if(!BOOTSTRAP_TOKEN||!safeEq(body.code,BOOTSTRAP_TOKEN))return respond(res,403,{error:'invalid_setup_code'});
      if(req.url==='/register/options'){
        const o=await generateRegistrationOptions({rpName:'NYXA',rpID:RP_ID,userName:'owner',userDisplayName:'NYXA Owner',attestationType:'none',authenticatorSelection:{residentKey:'preferred',userVerification:'required'},excludeCredentials:[]});
        db.challenges.registration={kind:'registration',challenge:o.challenge,expires:now+CHALLENGE_TTL_MS};save();return respond(res,200,o);
      }
      const ch=db.challenges.registration;delete db.challenges.registration;save();
      if(!ch||now>ch.expires)return respond(res,403,{error:'challenge_expired'});
      const v=await verifyRegistrationResponse({response:body.response,expectedChallenge:ch.challenge,expectedOrigin:ORIGIN,expectedRPID:RP_ID,requireUserVerification:true});
      if(!v.verified||!v.registrationInfo)return respond(res,403,{error:'verification_failed'});
      const c=v.registrationInfo.credential;db.credentials.push({id:c.id,publicKey:Buffer.from(c.publicKey).toString('base64url'),counter:c.counter,transports:body.response?.response?.transports||[],status:'active'});db.usedBootstrap=true;audit('credential_registered',{credential_fingerprint:sha256(c.id)});return respond(res,200,{message:'Passkey erfolgreich registriert.'});
    }
    if(req.url==='/login/options') return respond(res,200,await authenticationOptions('login',{action:'authenticate_only'}));
    if(req.url==='/login/verify') { await verifyAuthentication(body,'login'); audit('login_verified'); return respond(res,200,{message:'Passkey kryptografisch geprüft. Keine Aktionsfreigabe erteilt.'}); }
    if(req.url==='/authorize/options'){
      if(!exactKeys(body,['operation_id'])||!validId(body.operation_id)||!catalog.has(body.operation_id))return respond(res,400,{error:'unknown_operation'});
      const tx=catalog.get(body.operation_id); return respond(res,200,await authenticationOptions('authorize',{...tx}));
    }
    if(req.url==='/authorize/verify'){const verified=await verifyAuthentication(body,'authorize');return respond(res,200,issueGrant(verified));}
    if(req.url==='/revoke/options'){
      if(!exactKeys(body,['grant_id'])||!validUuid(body.grant_id))return respond(res,400,{error:'invalid_grant_id'});
      const issued=join(GRANT_ROOT,'issued',`${body.grant_id}.json`);if(!existsSync(issued))return respond(res,404,{error:'grant_not_active'});
      return respond(res,200,await authenticationOptions('revoke',{action:'revoke_human_authority_grant',grant_id:body.grant_id,display:`Mandat ${body.grant_id} vor Ausführung widerrufen`}));
    }
    if(req.url==='/revoke/verify'){
      const verified=await verifyAuthentication(body,'revoke'); const id=verified.subject.grant_id;
      mkdirSync(join(GRANT_ROOT,'revoked'),{recursive:true,mode:0o700});renameSync(join(GRANT_ROOT,'issued',`${id}.json`),join(GRANT_ROOT,'revoked',`${id}.json`));
      audit('grant_revoked',{grant_id:id});return respond(res,200,{revoked:true,grant_id:id});
    }
  } catch(error) {
    const status=Number.isInteger(error?.status)?error.status:400;
    console.error('[human-gate]',req.url,error?.message||'request_failed');
    return respond(res,status,{error:error?.message||'request_failed'});
  }
}).listen(LISTEN_PORT,LISTEN_HOST);
