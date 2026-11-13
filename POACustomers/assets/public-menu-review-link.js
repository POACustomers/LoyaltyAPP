/* Branch-specific Google Maps location/review link for the public NFC menu.
   Each branch NFC tag uses menu.html?location_id=<locations.id>.
   Destination comes from the GM-managed locations.maps_url field. */
(function(){
  const link=document.getElementById('publicMenuReviewLink');
  if(!link)return;
  const params=new URLSearchParams(window.location.search);
  const locationId=(params.get('location_id')||params.get('branch_id')||'').trim();
  if(!locationId||!window.sb)return;
  const isHttpsUrl=value=>{
    try{const u=new URL(String(value||''));return u.protocol==='https:';}catch(_){return false;}
  };
  (async function(){
    try{
      const {data,error}=await window.sb.from('locations')
        .select('id,name,city,address,maps_url,is_active')
        .eq('id',locationId).eq('is_active',true).maybeSingle();
      if(error||!data)return;
      let destination=String(data.maps_url||'').trim();
      if(!isHttpsUrl(destination)){
        const query=[data.name,data.address,data.city].filter(Boolean).join(' ');
        if(!query)return;
        destination='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);
      }
      link.href=destination;
      link.hidden=false;
      link.setAttribute('aria-label','رأيك يهمنا - افتح موقع '+String(data.name||'الفرع')+' على Google Maps');
      link.title='رأيك يهمنا';
    }catch(_){
      link.hidden=true;
    }
  })();
})();


/* Return to the welcome page and open the branch rating selector. */
(function(){
  const back=document.getElementById('backToRatingLink');
  if(!back)return;
  const params=new URLSearchParams(window.location.search);
  params.set('show_rating','1');
  const destination=new URL('welcome.html',window.location.href);
  ['location_id','branch_id'].forEach(key=>{
    const value=(new URLSearchParams(window.location.search).get(key)||'').trim();
    if(value)destination.searchParams.set(key,value);
  });
  destination.searchParams.set('show_rating','1');
  back.href=destination.pathname+destination.search;
})();
