(function(){
  'use strict';
  const menuLink=document.getElementById('viewMenuLink');
  const evaluateButton=document.getElementById('evaluateButton');
  const dialog=document.getElementById('branchDialog');
  const branchList=document.getElementById('branchList');
  const closeButton=document.getElementById('closeBranchDialog');
  const errorBox=document.getElementById('branchError');
  const params=new URLSearchParams(window.location.search);
  const locationId=(params.get('location_id')||params.get('branch_id')||'').trim();
  if(locationId)menuLink.href='menu.html?location_id='+encodeURIComponent(locationId);
  let branchesLoaded=false;
  let previousFocus=null;
  const safeUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'';}catch(_){return '';}};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function openDialog(){previousFocus=document.activeElement;dialog.hidden=false;document.body.style.overflow='hidden';closeButton.focus();loadBranches();}
  function closeDialog(){dialog.hidden=true;document.body.style.overflow='';previousFocus?.focus?.();}
  async function loadBranches(){
    if(branchesLoaded)return;
    if(!window.sb){showError('تعذر الاتصال بالخدمة. حاول مرة أخرى بعد قليل.');return;}
    branchList.innerHTML='<div class="dc-branch-loading">Loading branches…</div>';
    try{
      let query=window.sb.from('locations').select('id,name,city,address,maps_url,is_active').eq('is_active',true).order('name',{ascending:true});
      const {data,error}=await query;
      if(error)throw error;
      const rows=Array.isArray(data)?data:[];
      if(!rows.length){branchList.innerHTML='<div class="dc-branch-loading">No active branches are available yet.</div>';branchesLoaded=true;return;}
      branchList.innerHTML=rows.map(row=>{
        const url=safeUrl(row.maps_url);
        const fallback=[row.name,row.address,row.city].filter(Boolean).join(' ');
        const destination=url|| (fallback?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(fallback):'');
        if(!destination)return '<button class="dc-branch-button" type="button" disabled>'+escapeHtml(row.name||'Dina’s Corner Branch')+'</button>';
        return '<a class="dc-branch-button" href="'+escapeHtml(destination)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(row.name||'Dina’s Corner Branch')+'</a>';
      }).join('');
      branchesLoaded=true;
    }catch(err){
      branchList.innerHTML='<div class="dc-branch-loading">Could not load branches.</div>';
      showError('لم نتمكن من تحميل الفروع. تأكد من اتصال الإنترنت وإعدادات الفروع.');
      console.error('Dina Corner branch list:',err);
    }
  }
  function showError(message){errorBox.textContent=message;errorBox.hidden=false;}
  evaluateButton?.addEventListener('click',async()=>{
    if(!locationId){openDialog();return;}
    if(!window.sb){openDialog();return;}
    try{
      const {data,error}=await window.sb.from('locations').select('name,maps_url,address,city,is_active').eq('id',locationId).eq('is_active',true).maybeSingle();
      if(error||!data){openDialog();return;}
      const destination=safeUrl(data.maps_url)||('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([data.name,data.address,data.city].filter(Boolean).join(' ')));
      if(destination)window.open(destination,'_blank','noopener,noreferrer');else openDialog();
    }catch(_){openDialog();}
  });
  closeButton?.addEventListener('click',closeDialog);
  dialog?.addEventListener('click',event=>{if(event.target===dialog)closeDialog();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialog&&!dialog.hidden)closeDialog();});
})();
