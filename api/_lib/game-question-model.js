const clean=(value,max,name)=>{const text=String(value??'').trim().replace(/\s+/g,' ');if(!text||text.length>max)throw new Error(name+' مطلوب، وبحد أقصى '+max+' حرفًا.');return text;};
export function validateQuestion(body){
 const gradeId=String(body.gradeId||'');if(!/^g(?:0\d|1[01])$/.test(gradeId))throw Error('اختر صفًا من الأول إلى الثاني عشر.');
 const subject=clean(body.subject,150,'المادة'),semester=clean(body.semester,80,'الفصل الدراسي'),unit=clean(body.unit,200,'الوحدة'),lesson=clean(body.lesson,200,'الدرس'),text=clean(body.text,2000,'نص السؤال');
 const type=body.type;if(!['mc','tf'].includes(type))throw Error('نوع السؤال غير صحيح.');let options=[];
 if(type==='mc'){if(!Array.isArray(body.options)||body.options.length<2||body.options.length>4)throw Error('أضف من خيارين إلى أربعة خيارات.');options=body.options.map(v=>clean(v,500,'الخيار'));if(new Set(options).size!==options.length)throw Error('خيارات السؤال يجب أن تكون مختلفة.');}
 const answer=Number(body.answer);if(body.answer===''||body.answer==null||!Number.isInteger(answer)||answer<0||answer>=(type==='mc'?options.length:2))throw Error('حدد الإجابة الصحيحة.');
 const reference=String(body.reference||'').trim();if(reference.length>200)throw Error('المرجع يجب ألا يتجاوز 200 حرف.');return {gradeId,subject,semester,unit,lesson,type,text,options,answer,reference};
}
export function publicQuestion(row){const q={t:row.type,q:row.text,k:(Number(row.answer)+row.text.length)%(row.type==='mc'?row.options.length:2),ref:row.reference||'سؤال مضاف من الإدارة',gqid:'public:'+row.id};if(row.type==='mc')q.o=row.options;return {id:String(row.id),gradeId:row.grade_id,subject:row.subject,semester:row.semester,unit:row.unit,lesson:row.lesson,q};}
export function adminQuestion(row){return {id:String(row.id),gradeId:row.grade_id,subject:row.subject,semester:row.semester,unit:row.unit,lesson:row.lesson,type:row.type,text:row.text,options:row.options,answer:Number(row.answer),reference:row.reference||'',updatedAt:row.updated_at};}
