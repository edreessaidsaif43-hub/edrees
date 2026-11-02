import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
const COOKIE='game_admin_session',TTL=8*60*60;
export function createGameAdminSession(secret=''){
 const key=String(secret),sign=value=>createHmac('sha256',key).update('game-admin-session:'+value).digest('base64url');
 function cookie(req,value,maxAge){const secure=req.headers?.['x-forwarded-proto']==='https'||req.socket?.encrypted||process.env.VERCEL==='1'||process.env.NODE_ENV==='production';return COOKIE+'='+value+'; Path=/api/game-questions; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(secure?'; Secure':'');}
 function sameOrigin(req){const origin=req.headers?.origin,site=req.headers?.['sec-fetch-site'];if(site==='cross-site')return false;if(!origin)return true;try{return new URL(origin).host.toLowerCase()===String(req.headers?.host||'').toLowerCase();}catch{return false;}}
 function valid(req){if(!key||!sameOrigin(req))return false;const match=String(req.headers?.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));if(!match)return false;const token=match.slice(COOKIE.length+1);if(token.length>512)return false;const [payload,signature,...rest]=token.split('.');if(!payload||!signature||rest.length||! /^[a-zA-Z0-9_-]+$/.test(payload)||! /^[a-zA-Z0-9_-]{43}$/.test(signature))return false;const expected=Buffer.from(sign(payload)),provided=Buffer.from(signature);if(expected.length!==provided.length||!timingSafeEqual(expected,provided))return false;try{const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')),now=Math.floor(Date.now()/1000);return data.v===1&&Number.isInteger(data.iat)&&Number.isInteger(data.exp)&&data.iat<=now+60&&data.exp>now&&data.exp-data.iat===TTL;}catch{return false;}}
 function start(req,res){if(!key)throw Error('admin_session_not_configured');const now=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({v:1,iat:now,exp:now+TTL,n:randomBytes(12).toString('base64url')})).toString('base64url');res.setHeader('Set-Cookie',cookie(req,payload+'.'+sign(payload),TTL));}
 function clear(req,res){res.setHeader('Set-Cookie',cookie(req,'',0));}
 return {configured:!!key,valid,sameOrigin,start,clear};
}
