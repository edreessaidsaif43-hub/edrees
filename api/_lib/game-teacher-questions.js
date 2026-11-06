import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {validateQuestion,adminQuestion,publicQuestion} from './game-question-model.js';

const COOKIE='game_teacher_session',TTL=8*60*60,MAX_ID=9223372036854775807n;
const validId=id=>/^\d{1,19}$/.test(id)&&BigInt(id)>0n&&BigInt(id)<=MAX_ID;
export function createTeacherQuestionHandler(database,login,secret=''){
 const key=String(secret),sign=value=>createHmac('sha256',key).update('game-teacher-questions:'+value).digest('base64url');
 let schema;
 function sameOrigin(req){if(req.headers?.['sec-fetch-site']==='cross-site')return false;try{return !req.headers?.origin||new URL(req.headers.origin).host.toLowerCase()===String(req.headers?.host||'').toLowerCase();}catch{return false;}}
 function setCookie(req,res,value,age){const secure=req.headers?.['x-forwarded-proto']==='https'||req.socket?.encrypted||process.env.VERCEL==='1'||process.env.NODE_ENV==='production';res.setHeader('Set-Cookie',COOKIE+'='+value+'; Path=/api/game-questions; HttpOnly; SameSite=Strict; Max-Age='+age+(secure?'; Secure':''));}
 function identity(req){if(!key||!sameOrigin(req))return null;const cookie=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));if(!cookie||cookie.length>1600)return null;const [value,sig,...extra]=cookie.slice(COOKIE.length+1).split('.');if(!value||!sig||extra.length||!/^[\w-]+$/.test(value)||!/^[\w-]{43}$/.test(sig))return null;const expected=Buffer.from(sign(value)),provided=Buffer.from(sig);if(expected.length!==provided.length||!timingSafeEqual(expected,provided))return null;try{const data=JSON.parse(Buffer.from(value,'base64url')),now=Math.floor(Date.now()/1000);return data.v===1&&typeof data.userId==='string'&&data.userId.length>0&&data.userId.length<=200&&Number.isInteger(data.iat)&&Number.isInteger(data.exp)&&data.iat<=now+60&&data.exp>now&&data.exp-data.iat===TTL?data:null;}catch{return null;}}
 const ensure=()=>schema||(schema=(async()=>{
  await database`CREATE TABLE IF NOT EXISTS game_teacher_questions (id BIGSERIAL PRIMARY KEY,owner_user_id TEXT NOT NULL,author_name TEXT NOT NULL,grade_id TEXT NOT NULL,subject TEXT NOT NULL,semester TEXT NOT NULL,unit TEXT NOT NULL,lesson TEXT NOT NULL,type TEXT NOT NULL,text TEXT NOT NULL,options JSONB NOT NULL DEFAULT '[]'::jsonb,answer SMALLINT NOT NULL,reference TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),deleted_at TIMESTAMPTZ)`;
  await database`CREATE INDEX IF NOT EXISTS game_teacher_questions_grade_id_idx ON game_teacher_questions(grade_id,id DESC)`;
  await database`CREATE INDEX IF NOT EXISTS game_teacher_questions_owner_idx ON game_teacher_questions(owner_user_id,id DESC)`;
 })().catch(error=>{schema=null;throw error;}));
 function browseQuestion(row,user){return {...adminQuestion(row),authorName:row.author_name,source:'teacher',canEdit:!!user&&row.owner_user_id===user.userId};}
 function gameQuestion(row){const item=publicQuestion(row);item.source='teacher';item.q.gqid='teacher:'+row.id;item.q.ref=row.reference||'مشاركة معلم';return item;}
 return async function(req,res){
  const fail=(status,message)=>res.status(status).json({message}),action=String(req.query?.action||''),user=identity(req);
  if(!['teacher_login','teacher_logout','teacher_session','teacher_bank','teacher_list','teacher_save','teacher_delete'].includes(action))return fail(405,'العملية غير متاحة.');
  const read=['teacher_session','teacher_bank','teacher_list'].includes(action);
  if(req.method!==(read?'GET':'POST'))return fail(405,'العملية غير متاحة.');
  if(!read&&!sameOrigin(req))return fail(403,'افتح مكتبة الأسئلة من الموقع نفسه.');
  let body={};if(!read){try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return fail(400,'بيانات الطلب غير صحيحة.');}}
  if(action==='teacher_logout'){setCookie(req,res,'',0);return res.status(200).json({ok:true});}
  if(action==='teacher_session')return res.status(200).json({authenticated:!!user,name:user?.name||''});
  if(action==='teacher_login'){
   if(!key||!login)return fail(503,'تعذر التحقق من حساب المعلم. تحقق من إعداد قاعدة البيانات.');
   const contact=String(body.contact||'').trim(),password=String(body.password||'');if(!contact||contact.length>200||!password||password.length>4096)return fail(400,'أدخل بيانات حساب المعلم.');
   const out=await login({contact,password});if(out.error)return fail(['invalid_credentials','not_found'].includes(out.error)?401:503,['invalid_credentials','not_found'].includes(out.error)?'بيانات الحساب غير صحيحة.':'تعذر الاتصال بحساب المعلم. أعد المحاولة.');
   const userId=String(out.data?.userId||''),name=String(out.data?.profile?.name||out.data?.profile?.full_name||'معلم مشارك').trim().slice(0,100);if(!userId||userId.length>200)return fail(503,'تعذر التحقق من حساب المعلم.');
   const now=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({v:1,userId,name,iat:now,exp:now+TTL,n:randomBytes(12).toString('base64url')})).toString('base64url');setCookie(req,res,payload+'.'+sign(payload),TTL);return res.status(200).json({authenticated:true,name});
  }
  if(['teacher_save','teacher_delete'].includes(action)&&!user)return fail(401,'تحقق من حساب المعلم لإضافة أسئلتك أو تعديلها.');
  if(!database)return fail(503,'قاعدة بيانات مكتبة أسئلة المعلمين غير مهيأة.');
  const grade=String(req.query?.grade||'');if(grade&&!/^g(?:0\d|1[01])$/.test(grade))return fail(400,'الصف غير صحيح.');
  await ensure();
  if(action==='teacher_bank'){
   const cursor=String(req.query?.cursor||MAX_ID);if(!grade||!validId(cursor))return fail(400,'اختر صفًا ومؤشر صفحة صحيحًا.');
   const rows=await database`SELECT * FROM game_teacher_questions WHERE deleted_at IS NULL AND grade_id=${grade} AND id < ${cursor}::bigint ORDER BY id DESC LIMIT 501`;
   return res.status(200).json({items:rows.slice(0,500).map(gameQuestion),nextCursor:rows.length>500?String(rows[499].id):null});
  }
  if(action==='teacher_list'){
   const subject=String(req.query?.subject||'').slice(0,150),search=String(req.query?.q||'').slice(0,200),offset=Math.max(0,Math.min(1000000,parseInt(req.query?.offset,10)||0)),mine=req.query?.mine==='1';if(mine&&!user)return fail(401,'تحقق من حسابك لعرض أسئلتك.');const owner=mine?user.userId:'';
   const [rows,counts]=await Promise.all([
    database`SELECT * FROM game_teacher_questions WHERE deleted_at IS NULL AND (${grade}='' OR grade_id=${grade}) AND (${subject}='' OR subject=${subject}) AND (${owner}='' OR owner_user_id=${owner}) AND (${search}='' OR text ILIKE ${'%'+search+'%'} OR lesson ILIKE ${'%'+search+'%'}) ORDER BY id DESC LIMIT 50 OFFSET ${offset}`,
    database`SELECT COUNT(*) AS total FROM game_teacher_questions WHERE deleted_at IS NULL AND (${grade}='' OR grade_id=${grade}) AND (${subject}='' OR subject=${subject}) AND (${owner}='' OR owner_user_id=${owner}) AND (${search}='' OR text ILIKE ${'%'+search+'%'} OR lesson ILIKE ${'%'+search+'%'})`
   ]);return res.status(200).json({items:rows.map(row=>browseQuestion(row,user)),total:Number(counts[0]?.total||0)});
  }
  const id=String(body.id||'');if(id&&!validId(id))return fail(400,'معرّف السؤال غير صحيح.');
  if(action==='teacher_save'){
   let q;try{q=validateQuestion(body);}catch(error){return fail(400,error.message);}let rows;
   if(id)rows=await database`UPDATE game_teacher_questions SET grade_id=${q.gradeId},subject=${q.subject},semester=${q.semester},unit=${q.unit},lesson=${q.lesson},type=${q.type},text=${q.text},options=${JSON.stringify(q.options)}::jsonb,answer=${q.answer},reference=${q.reference},updated_at=NOW() WHERE id=${id}::bigint AND owner_user_id=${user.userId} AND deleted_at IS NULL RETURNING *`;
   else rows=await database`INSERT INTO game_teacher_questions(owner_user_id,author_name,grade_id,subject,semester,unit,lesson,type,text,options,answer,reference) VALUES(${user.userId},${user.name},${q.gradeId},${q.subject},${q.semester},${q.unit},${q.lesson},${q.type},${q.text},${JSON.stringify(q.options)}::jsonb,${q.answer},${q.reference}) RETURNING *`;
   if(!rows.length)return fail(404,'السؤال غير موجود ضمن أسئلتك.');return res.status(id?200:201).json({item:browseQuestion(rows[0],user),message:id?'تم تعديل سؤالك.':'تم نشر سؤالك في مكتبة المعلمين وأصبح متاحًا للجميع في الألعاب.'});
  }
  if(!validId(id))return fail(400,'معرّف السؤال غير صحيح.');const rows=await database`UPDATE game_teacher_questions SET deleted_at=NOW(),updated_at=NOW() WHERE id=${id}::bigint AND owner_user_id=${user.userId} AND deleted_at IS NULL RETURNING id`;if(!rows.length)return fail(404,'السؤال غير موجود ضمن أسئلتك.');return res.status(200).json({ok:true});
 };
}
