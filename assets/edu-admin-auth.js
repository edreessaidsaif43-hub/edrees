(function(){
 const endpoint=location.protocol==='file:'?'https://altahdir.app/api/edu':'/api/edu';
 window.eduAdminAuthenticated=false;
 async function request(action,payload={}){const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||'تعذر التحقق من بيانات الإدارة.');return data;}
 window.eduAdminLogin=async function(password){try{await request('adminLogin',{password});window.eduAdminAuthenticated=true;return true;}catch(error){if(typeof showToast==='function')showToast(error.message,'error');return false;}finally{const field=document.getElementById('admin-password');if(field)field.value='';}};
 window.eduAdminLogout=async function(){try{await request('adminLogout');}finally{window.eduAdminAuthenticated=false;}};
})();
