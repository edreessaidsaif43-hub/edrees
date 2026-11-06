import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
const TTL=8*60*60,COOKIE='edu_admin_session';
const attempts=new Map();
const digest=value=>createHash('sha256').update(String(value)).digest();
const same=(a,b)=>timingSafeEqual(digest(a),digest(b));
export function createEduAdminAuth(env=process.env,now=Date.now){
 const password=String(env.ADMIN_PASSWORD||'');
 const secret=String(env.EDU_ADMIN_SESSION_SECRET||password);
 const configured=!!password;
 const key=createHmac('sha256',secret).update('edu-admin-password-only:'+password).digest();
 const sign=p=>createHmac('sha256',key).update(p).digest('base64url');
 function sameOrigin(req){if(req.headers?.['sec-fetch-site']==='cross-site')return false;const origin=req.headers?.origin;if(!origin)return true;try{return new URL(origin).host.toLowerCase()===String(req.headers?.host||'').toLowerCase();}catch{return false;}}
 function cookie(req,value,age){const secure=env.VERCEL==='1'||env.NODE_ENV==='production'||req.socket?.encrypted||req.headers?.['x-forwarded-proto']==='https';return COOKIE+'='+value+'; Path=/api/edu; HttpOnly; SameSite=Strict; Max-Age='+age+(secure?'; Secure':'');}
 function valid(req){
  if(!configured||!sameOrigin(req))return false;
  const entry=String(req.headers?.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  if(!entry)return false;const token=entry.slice(COOKIE.length+1);if(token.length>512)return false;
  const [payload,signature,...rest]=token.split('.');if(!payload||!signature||rest.length||!same(sign(payload),signature))return false;
  try{const data=JSON.parse(Buffer.from(payload,'base64url'));const time=Math.floor(now()/1000);return data.v===1&&Number.isInteger(data.iat)&&Number.isInteger(data.exp)&&data.iat<=time+60&&data.exp>time&&data.exp-data.iat===TTL;}catch{return false;}
 }
 function handle(req,res,action,body){
  if(!['adminLogin','adminLogout','adminSession'].includes(action))return false;
  res.setHeader('Cache-Control','no-store');
  const reply=(code,data)=>{res.status(code).json(data);return true;};
  if(!sameOrigin(req))return reply(403,{success:false,error:'forbidden'});
  if(action==='adminSession')return req.method==='GET'?reply(valid(req)?200:401,{success:valid(req)}):reply(405,{success:false,error:'method_not_allowed'});
  if(req.method!=='POST')return reply(405,{success:false,error:'method_not_allowed'});
  if(action==='adminLogout'){res.setHeader('Set-Cookie',cookie(req,'',0));return reply(200,{success:true});}
  if(!configured)return reply(503,{success:false,error:'admin_not_configured',message:'لم تُضبط كلمة مرور الإدارة على الخادم.'});
  const ip=String(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const time=now(),record=attempts.get(ip);if(record&&record.until>time&&record.count>=5)return reply(429,{success:false,error:'too_many_attempts'});
  if(!same(body.password||'',password)){
   if(attempts.size>1000)for(const [k,v] of attempts){if(v.until<=time)attempts.delete(k);}
   if(attempts.size>=1000&&!attempts.has(ip))return reply(429,{success:false,error:'too_many_attempts'});
   attempts.set(ip,{count:record&&record.until>time?record.count+1:1,until:record&&record.until>time?record.until:time+15*60000});return reply(401,{success:false,error:'invalid_credentials'});
  }
  attempts.delete(ip);const seconds=Math.floor(time/1000),payload=Buffer.from(JSON.stringify({v:1,iat:seconds,exp:seconds+TTL,n:randomBytes(16).toString('base64url')})).toString('base64url');
  res.setHeader('Set-Cookie',cookie(req,payload+'.'+sign(payload),TTL));return reply(200,{success:true});
 }
 return {valid,handle};
}
