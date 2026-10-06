import http from "node:http";
import crypto from "node:crypto";
import { consultNanny } from "/opt/nyxa-governed-memory-mcp-dev/dist/cognitive/nanny.js";
const host=process.env.NANNY_HOST||"127.0.0.1", port=Number(process.env.NANNY_PORT||7088);
const families=new Map(), codes=new Map();
const json=(res,status,obj)=>{res.statusCode=status;res.end(JSON.stringify(obj));};
const token=()=>crypto.randomBytes(24).toString("base64url");
const code=()=>String(crypto.randomInt(100000,1000000));
function family(auth){let t=(auth||"").replace(/^Bearer\s+/i,"");return [...families.values()].find(f=>f.token===t);}
const server=http.createServer(async(req,res)=>{
 res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method==="OPTIONS"){res.statusCode=204;res.end();return;}
 if(req.method==="GET"&&req.url==="/health"){res.end(JSON.stringify({ok:true,service:"bb-nanny",policy:"BB_NANNY_MEDICAL_BARRIER_V1"}));return;}
 let raw=""; req.on("data",c=>{raw+=c;if(raw.length>20000)req.destroy();});
 req.on("end",async()=>{try{
  const body=JSON.parse(raw||"{}");
  if(req.method==="POST"&&req.url==="/v1/nanny/family/create"){let id=crypto.randomUUID(),c=code(),f={id,token:token(),events:[],joinedAt:null};families.set(id,f);codes.set(c,{id,expires:Date.now()+600000});return json(res,200,{familyId:id,pairingCode:c,token:f.token,expiresIn:600});}
  if(req.method==="POST"&&req.url==="/v1/nanny/family/join"){let x=codes.get(String(body.code||""));if(!x||x.expires<Date.now())return json(res,403,{error:"invalid_or_expired_code"});let f=families.get(x.id);f.joinedAt=new Date().toISOString();codes.delete(String(body.code));return json(res,200,{familyId:f.id,token:f.token,connected:true,joinedAt:f.joinedAt});}
  if(req.method==="GET"&&req.url==="/v1/nanny/family/status"){let f=family(req.headers.authorization);if(!f)return json(res,401,{error:"unauthorized"});return json(res,200,{familyId:f.id,connected:!!f.joinedAt,joinedAt:f.joinedAt});}
  if(req.url?.startsWith("/v1/nanny/family/events")){let f=family(req.headers.authorization);if(!f)return json(res,401,{error:"unauthorized"});
   if(req.method==="POST"){let e={id:crypto.randomUUID(),time:new Date().toISOString(),childId:String(body.childId||""),state:String(body.state||"UNKNOWN"),confidence:Number(body.confidence||0),audioStored:false};f.events.push(e);f.events=f.events.slice(-500);return json(res,200,{ok:true,event:e});}
   if(req.method==="GET"){let since=Number(new URL(req.url,"http://x").searchParams.get("since")||0);return json(res,200,{events:f.events.filter(e=>Date.parse(e.time)>since)});}
  }
  if(req.method==="POST"&&req.url==="/v1/nanny/chat"){const child=body.child?.name?`\nAktives Kind: ${String(body.child.name).slice(0,80)}.`:"";const children=Array.isArray(body.children)?`\nKinderübersicht (entryCount 0 bedeutet keine gespeicherten Einträge): ${JSON.stringify(body.children.slice(0,20)).slice(0,3000)}`:"";const recent=Array.isArray(body.recentEntries)?`\nEinträge des aktiven Kindes: ${JSON.stringify(body.recentEntries.slice(-50)).slice(0,6000)}`:"";const all=Array.isArray(body.allEntries)?`\nApp-Einträge aller Kinder: ${JSON.stringify(body.allEntries.slice(-100)).slice(0,7000)}`:"";return json(res,200,await consultNanny(String(body.message||"")+child+children+recent+all));}
  return json(res,404,{error:"not_found"});
 }catch(e){json(res,400,{error:e instanceof Error?e.message:"failed"});}});
});
server.listen(port,host,()=>console.log(`bb-nanny ${host}:${port}`));