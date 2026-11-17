import {createHash,randomUUID} from 'node:crypto';
import {validateQuestion} from './game-question-model.js';

const normalize=value=>String(value).normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/[\u064b-\u065f\u0670]/g,'').replace(/ى/g,'ي').replace(/\s+/g,' ').trim().replace(/[.،,]+$/,'');
const questionKey=q=>JSON.stringify([q.t,q.q,q.o||[],q.k]);
const digest=value=>createHash('sha256').update(value).digest('hex');

function lessonPayload(item,mode='replace'){
 if(!Array.isArray(item.questions)||!item.questions.length||item.questions.length>100)throw Error('يجب أن يحتوي الدرس بين سؤال واحد و100 سؤال.');
 const validated=item.questions.map(q=>validateQuestion({...q,gradeId:item.gradeId,subject:item.subject,semester:item.semester,unit:item.unit,lesson:item.lesson}));
 const {gradeId,subject,semester,unit,lesson}=validated[0];
 const lessonKey=digest(JSON.stringify([gradeId,normalize(subject),normalize(semester).replace(/الفصل|الدراسي/g,'').trim(),normalize(unit),normalize(lesson)]));
 const questions=validated.map((q,index)=>{
  const raw={t:q.type,q:q.text,k:(q.answer+q.text.length)%(q.type==='mc'?q.options.length:2),ref:q.reference||'سؤال '+(index+1)};
  if(q.type==='mc')raw.o=q.options;
  const suffix=mode==='append'?digest(questionKey(raw)):index;
  raw.gqid='sheet:'+lessonKey+':'+suffix;
  return raw;
 });
 return {lesson_key:lessonKey,grade_id:gradeId,subject,semester,unit,lesson,questions};
}

function combineLessons(rows){
 const lessons=new Map();
 for(const row of rows){
  let entry=lessons.get(row.lesson_key);
  if(!entry){
   const lesson={key:row.lesson_key,gradeId:row.grade_id,subject:row.subject,semester:row.semester,unit:row.unit,lesson:row.lesson,qs:[]};
   if(row.mode==='append')lesson.append=true;
   entry={lesson,seen:new Set()};
   lessons.set(row.lesson_key,entry);
  }
  for(const q of row.questions){
   const key=questionKey(q);
   if(row.mode==='append'&&entry.seen.has(key))continue;
   entry.lesson.qs.push(q);
   entry.seen.add(key);
  }
 }
 return [...lessons.values()].map(entry=>entry.lesson);
}

export function createGameSheetHandler(sql){
 let schema;
 const ensure=()=>schema||(schema=(async()=>{
  await sql`CREATE TABLE IF NOT EXISTS game_sheet_imports(id TEXT PRIMARY KEY,source_name TEXT NOT NULL,expected_batches INTEGER NOT NULL,expected_lessons INTEGER NOT NULL,expected_questions INTEGER NOT NULL,received_batches JSONB NOT NULL DEFAULT '{}'::jsonb,status TEXT NOT NULL DEFAULT 'draft',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),published_at TIMESTAMPTZ)`;
  await sql`CREATE TABLE IF NOT EXISTS game_sheet_lessons(import_id TEXT NOT NULL,lesson_key TEXT NOT NULL,grade_id TEXT NOT NULL,subject TEXT NOT NULL,semester TEXT NOT NULL,unit TEXT NOT NULL,lesson TEXT NOT NULL,questions JSONB NOT NULL,PRIMARY KEY(import_id,lesson_key))`;
  await sql`CREATE INDEX IF NOT EXISTS game_sheet_lessons_grade_idx ON game_sheet_lessons(import_id,grade_id)`;
  await sql`ALTER TABLE game_sheet_imports
   ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'replace',
   ADD COLUMN IF NOT EXISTS write_revision BIGINT NOT NULL DEFAULT 0`;
 })().catch(error=>{schema=null;throw error;}));

 return async(req,res)=>{
  const fail=(status,message)=>res.status(status).json({message}),action=String(req.query?.action||'');
  await ensure();

  if(action==='sheet_catalog'){
   if(req.method!=='GET')return fail(405,'العملية غير متاحة.');
   const rows=await sql`
    SELECT grade_id,subject FROM game_public_questions WHERE deleted_at IS NULL
    UNION
    SELECT l.grade_id,l.subject
    FROM game_sheet_lessons l JOIN game_sheet_imports i ON i.id=l.import_id
    WHERE i.status='active'
    ORDER BY grade_id,subject`;
   return res.status(200).json({subjects:rows.map(row=>({gradeId:row.grade_id,subject:row.subject}))});
  }

  if(req.method==='GET'&&['sheet_bank','sheet_rows','sheet_info'].includes(action)){
   const requested=action==='sheet_rows'?String(req.query?.importId||''):'';
   if(requested&&!/^[0-9a-f-]{36}$/i.test(requested))return fail(400,'معرّف الملف غير صحيح.');
   const [source]=await sql`SELECT id,source_name,expected_lessons,expected_questions,published_at FROM game_sheet_imports WHERE status='active' AND (${requested}='' OR id=${requested}) ORDER BY published_at DESC,id DESC LIMIT 1`;
   if(action==='sheet_info')return res.status(200).json({source:source?{id:source.id,name:source.source_name,lessons:source.expected_lessons,questions:source.expected_questions,updatedAt:source.published_at}:null});
   if(!source)return res.status(200).json({lessons:[],version:null});
   const grade=String(req.query?.grade||'');
   if(!/^g(?:0\d|1[01])$/.test(grade))return fail(400,'اختر الصف.');
   // Older clients replace lesson arrays, so only updated clients receive append uploads.
   const includeAppend=req.query?.append==='1';
   const rows=await sql`
    WITH history AS (
     SELECT l.*,i.mode,i.published_at,i.id,
      COUNT(*) FILTER (WHERE i.mode='replace') OVER (
       PARTITION BY l.lesson_key ORDER BY i.published_at DESC,i.id DESC
       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS newer_replacements
     FROM game_sheet_lessons l JOIN game_sheet_imports i ON i.id=l.import_id
     WHERE i.status='active' AND l.grade_id=${grade}
      AND (${includeAppend}::boolean OR i.mode='replace')
      AND (i.published_at,i.id)<=(SELECT published_at,id FROM game_sheet_imports WHERE id=${source.id})
    )
    SELECT lesson_key,grade_id,subject,semester,unit,lesson,questions,mode
    FROM history WHERE newer_replacements=0 ORDER BY lesson_key,published_at,id`;
   return res.status(200).json({version:source.id,lessons:combineLessons(rows)});
  }

  if(req.method!=='POST')return fail(405,'العملية غير متاحة.');
  let body;
  try{
   body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
   if(!body||typeof body!=='object'||Array.isArray(body))throw Error();
  }catch{return fail(400,'بيانات الملف غير صحيحة.');}

  if(action==='sheet_begin'){
   const batches=Number(body.batches),lessons=Number(body.lessons),questions=Number(body.questions);
   if(!Number.isInteger(batches)||batches<1||batches>1000||!Number.isInteger(lessons)||lessons<1||lessons>20000||!Number.isInteger(questions)||questions<lessons||questions>100000)return fail(400,'حجم الملف غير مدعوم.');
   const mode=body.mode??'replace';
   if(!['append','replace'].includes(mode))return fail(400,'اختر طريقة تحديث الأسئلة.');
   const id=randomUUID(),name=String(body.name||'ملف أسئلة').trim().slice(0,200);
   await sql`INSERT INTO game_sheet_imports(id,source_name,expected_batches,expected_lessons,expected_questions,mode) VALUES(${id},${name},${batches},${lessons},${questions},${mode})`;
   return res.status(201).json({id});
  }

  const id=String(body.importId||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return fail(400,'معرّف تحديث الملف غير صحيح.');
  const [header]=await sql`SELECT * FROM game_sheet_imports WHERE id=${id} LIMIT 1`;
  if(!header)return fail(404,'تحديث الملف غير موجود.');

  if(action==='sheet_batch'){
   const batch=Number(body.batch);
   if(header.status!=='draft')return fail(409,'تم اعتماد هذا الملف بالفعل.');
   if(!Number.isInteger(batch)||batch<0||batch>=header.expected_batches||!Array.isArray(body.lessons)||!body.lessons.length||body.lessons.length>100)return fail(400,'دفعة الأسئلة غير صحيحة.');
   let lessons;
   try{lessons=body.lessons.map(lesson=>lessonPayload(lesson,header.mode));}catch(error){return fail(400,error.message);}
   if(new Set(lessons.map(l=>l.lesson_key)).size!==lessons.length)return fail(400,'يوجد درس مكرر داخل الدفعة.');
   const [result]=await sql`
    WITH draft AS (
     SELECT id FROM game_sheet_imports WHERE id=${id} AND status='draft' FOR UPDATE
    ), incoming AS (
     SELECT * FROM jsonb_to_recordset(${JSON.stringify(lessons)}::jsonb)
     AS x(lesson_key TEXT,grade_id TEXT,subject TEXT,semester TEXT,unit TEXT,lesson TEXT,questions JSONB)
    ), written AS (
     INSERT INTO game_sheet_lessons(import_id,lesson_key,grade_id,subject,semester,unit,lesson,questions)
     SELECT draft.id,lesson_key,grade_id,subject,semester,unit,lesson,questions FROM incoming CROSS JOIN draft
     ON CONFLICT(import_id,lesson_key) DO UPDATE SET grade_id=EXCLUDED.grade_id,subject=EXCLUDED.subject,
     semester=EXCLUDED.semester,unit=EXCLUDED.unit,lesson=EXCLUDED.lesson,questions=EXCLUDED.questions
     RETURNING lesson_key
    ), marked AS (
     UPDATE game_sheet_imports
     SET received_batches=received_batches||jsonb_build_object(${String(batch)}::text,${lessons.length}::integer),
      write_revision=write_revision+1
     WHERE id IN (SELECT id FROM draft) RETURNING id
    )
    SELECT COUNT(*) AS count FROM written`;
   if(Number(result?.count)!==lessons.length)return fail(409,'تعذر حفظ الدفعة. أعد المحاولة.');
   return res.status(200).json({ok:true});
  }

  if(action==='sheet_commit'){
   const success=()=>res.status(200).json({ok:true,lessons:header.expected_lessons,questions:header.expected_questions});
   if(header.status==='active')return success();
   const batches=Object.values(header.received_batches||{});
   if(batches.length!==header.expected_batches||batches.reduce((a,b)=>a+Number(b),0)!==header.expected_lessons)return fail(409,'لم يكتمل رفع الملف. أعد التحديث.');
   const [updated]=await sql`
    UPDATE game_sheet_imports i SET status='active',published_at=clock_timestamp()
    WHERE i.id=${id} AND i.status='draft' AND i.write_revision=${header.write_revision}::bigint
     AND (i.expected_lessons::bigint,i.expected_questions::bigint)=(
      SELECT COUNT(*),COALESCE(SUM(jsonb_array_length(questions)),0) FROM game_sheet_lessons WHERE import_id=i.id
     )
    RETURNING i.id`;
   if(updated)return success();
   const [current]=await sql`SELECT status FROM game_sheet_imports WHERE id=${id}`;
   if(current?.status==='active')return success();
   return fail(409,'أعداد الأسئلة لا تطابق الملف. تحقق من الملف وأعد رفعه.');
  }
  return fail(405,'العملية غير متاحة.');
 };
}
export {lessonPayload};
