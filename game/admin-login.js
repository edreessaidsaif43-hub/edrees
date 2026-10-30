(function(){
 const $=id=>document.getElementById(id),session=window.GameAdminSession;let version=0;
 function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
 $('login-form').onsubmit=async event=>{event.preventDefault();const ticket=++version,password=$('admin-password').value;$('login-submit').disabled=true;message('جارٍ التحقق من بيانات الدخول…');try{await session.request('admin_login',{}, {password});if(ticket===version)window.location.replace(session.editorPage);}catch(error){if(ticket===version)message(error.message,true);}finally{$('admin-password').value='';$('login-submit').disabled=false;}};
 $('login-submit').disabled=false;
 function checkSession(){const ticket=version;session.request('admin_session').then(()=>{if(ticket===version)window.location.replace(session.editorPage);}).catch(error=>{if(ticket===version&&error.status!==401)message(error.message,true);});}
 checkSession();window.addEventListener('pageshow',event=>{if(event.persisted)checkSession();});
})();
