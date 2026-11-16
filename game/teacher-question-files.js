(function(){
 'use strict';

 const MAX_BYTES=900_000;
 const MAX_PREVIEW=12;

 window.setupTeacherQuestionFiles=function(api,onPublished){
  const byId=id=>document.getElementById(id);
  const fields=byId('teacher-import-fields');
  const file=byId('teacher-question-file');
  const sheet=byId('teacher-question-sheet');
  const status=byId('teacher-import-status');
  const summary=byId('teacher-import-summary');
  const details=byId('teacher-import-review');
  const review=byId('teacher-import-items');
  const publish=byId('teacher-import-publish');
  let book=null,preview=null,version=0,busy=false,active=false,excelLoader;

  function note(message,error=false){
   status.textContent=message;
   status.classList.toggle('error',error);
  }

  function sync(){
   fields.disabled=!active||busy;
   sheet.disabled=!book||book.SheetNames.length<2;
   publish.disabled=!preview||preview.issues.length>0||!preview.questionCount;
  }

  function reset(){
   version++;
   book=null;
   preview=null;
   file.value='';
   sheet.replaceChildren();
   summary.textContent='';
   details.hidden=true;
   details.open=false;
   review.replaceChildren();
   note('');
   sync();
  }

  function showPreview(rows){
   preview=GameSheets.parseRows(rows);
   const {lessons,issues,warnings,questionCount,emptyRows,duplicates}=preview;
   const counts=[lessons.length+' درسًا',questionCount+' سؤالًا صالحًا'];
   if(issues.length)counts.push(issues.length+' خطأ يحتاج تصحيحًا');
   if(warnings.length)counts.push(warnings.length+' ملاحظة');
   if(emptyRows)counts.push(emptyRows+' صفًا بلا أسئلة');
   if(duplicates)counts.push(duplicates+' تكرارًا مستبعدًا');
   summary.textContent=counts.join(' · ');
   review.replaceChildren();
   for(const item of [...issues,...warnings]){
    const row=document.createElement('li');
    row.textContent='الصف '+item.row+' في الملف'+(item.block?'، السؤال '+item.block:'')+' — '+item.message;
    review.append(row);
   }

   let shown=0;
   for(const lesson of lessons){
    for(const question of lesson.questions.slice(0,MAX_PREVIEW-shown)){
     const row=document.createElement('li');
     const answer=question.type==='tf'?['خطأ','صح'][question.answer]:question.options[question.answer];
     row.textContent=[lesson.lesson,lesson.unit,lesson.subject,GameSheets.gradeNames[Number(lesson.gradeId.slice(1))],lesson.semester].join(' · ')+' — '+question.text+' ✓ '+answer;
     review.append(row);
     shown++;
    }
    if(shown>=MAX_PREVIEW)break;
   }
   details.hidden=!review.children.length;
   details.open=!!issues.length;
   const reviewLabel=byId('teacher-import-review-label');
   reviewLabel.textContent=shown<questionCount?'مراجعة الملاحظات ومعاينة أول '+shown+' سؤالًا':'مراجعة تفاصيل الملف';
   note(issues.length?'صحّح الأخطاء الموضّحة ثم أعد اختيار الملف.':questionCount?'راجع الأسئلة ثم انشرها في مكتبة المعلمين.':'الملف لا يحتوي على أسئلة صالحة.',!!issues.length);
   sync();
  }

  function readSheet(){
   showPreview(XLSX.utils.sheet_to_json(book.Sheets[sheet.value],{
    header:1,raw:false,defval:'',blankrows:true
   }));
  }

  function loadExcel(){
   if(window.XLSX)return Promise.resolve();
   if(excelLoader)return excelLoader;
   excelLoader=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    const timer=setTimeout(failed,12000);
    function failed(){
     clearTimeout(timer);
     script.remove();
     reject(Error('تعذر تحميل قارئ Excel. تحقق من اتصالك أو ارفع الملف بصيغة CSV.'));
    }
    script.onload=()=>{
     clearTimeout(timer);
     script.remove();
     if(window.XLSX)resolve();
     else failed();
    };
    script.onerror=failed;
    document.head.append(script);
   }).catch(error=>{
    excelLoader=null;
    throw error;
   });
   return excelLoader;
  }

  function readError(error){
   preview=null;
   summary.textContent='';
   review.replaceChildren();
   details.hidden=true;
   note(error.message||'تعذر قراءة الملف.',true);
   sync();
  }

  file.onchange=async()=>{
   const selected=file.files[0];
   const current=++version;
   preview=null;
   book=null;
   sheet.replaceChildren();
   summary.textContent='';
   review.replaceChildren();
   details.hidden=true;
   sync();
   note(selected?'جارٍ قراءة الملف…':'');
   if(!selected)return;
   try{
    if(selected.size>15*1024*1024)throw Error('حجم الملف يجب ألا يتجاوز 15 ميجابايت.');
    if(/\.csv$/i.test(selected.name)){
     const csv=await selected.text();
     if(current!==version)return;
     showPreview(GameSheets.readCSV(csv));
     return;
    }
    if(!/\.xlsx?$/i.test(selected.name))throw Error('اختر ملف Excel أو CSV.');
    const [bytes]=await Promise.all([selected.arrayBuffer(),loadExcel()]);
    if(current!==version)return;
    book=XLSX.read(bytes,{type:'array'});
    sheet.replaceChildren(...book.SheetNames.map(name=>new Option(name,name)));
    if(!sheet.options.length)throw Error('الملف لا يحتوي على أوراق عمل.');
    readSheet();
   }catch(error){
    if(current!==version)return;
    book=null;
    sheet.replaceChildren();
    readError(error);
   }
  };

  sheet.onchange=()=>{
   try{readSheet();}catch(error){readError(error);}
  };

  byId('teacher-import-template').onclick=()=>{
   const example={gradeId:'g07',subject:'العلوم',semester:'الأول',unit:'الطاقة',lesson:'الحرارة',questions:[
    {type:'tf',text:'المعادن توصل الحرارة.',options:[],answer:1},
    {type:'mc',text:'أي المواد التالية توصل الحرارة جيدًا؟',options:['النحاس','الخشب'],answer:0}
   ]};
   const rows=GameSheets.rowsFromLessons([example]);
   rows[0]=['الصف','المادة','الفصل الدراسي','الوحدة','الدرس','الأسئلة'];
   const url=URL.createObjectURL(new Blob([GameSheets.writeCSV(rows)],{type:'text/csv;charset=utf-8'}));
   const link=document.createElement('a');
   link.href=url;
   link.download='قالب-أسئلة-الدروس.csv';
   document.body.append(link);
   link.click();
   link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),10000);
  };

  publish.onclick=async()=>{
   if(!active||busy||publish.disabled)return;
   const questions=preview.lessons.flatMap(({questions,...lesson})=>
    questions.map(question=>({...lesson,...question}))
   );
   const body={questions};
   if(new TextEncoder().encode(JSON.stringify(body)).length>MAX_BYTES){
    note('الأسئلة تتجاوز حجم النشر المسموح. وزّع الدروس على ملفين أو أكثر ثم ارفعها تباعًا.',true);
    return;
   }
   busy=true;
   sync();
   note('جارٍ نشر أسئلة الدروس…');
   try{
    const {inserted,skipped}=await api('teacher_import',{},body);
    reset();
    note('تم نشر '+inserted+' سؤالًا.'+(skipped?' تم تجاوز '+skipped+' سؤالًا موجودًا بالفعل.':''));
    onPublished();
   }catch(error){
    note(error.message,true);
   }finally{
    busy=false;
    sync();
   }
  };

  byId('open-teacher-import').onclick=()=>{
   byId('teacher-file-import').open=true;
  };

  if(location.hash==='#teacher-file-import')byId('teacher-file-import').open=true;
  return function setImportSession(enabled){
   active=enabled;
   if(!enabled)reset();
   sync();
  };
 };
})();
