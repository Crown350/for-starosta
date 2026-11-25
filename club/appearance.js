/* Optional cosmetics in the new journal; no journal state or balance writes. */
(()=>{
  'use strict';
  const endpoint=new URL('../api/game-club/state',document.currentScript.src).href;let request=0;
  async function refresh(){const epoch=++request;let state=null;try{const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});if(response.ok)state=await response.json();}catch{}
    if(epoch!==request)return;for(const category of ['theme','table']){const item=Array.isArray(state?.catalogue)?state.catalogue.find(i=>i.id===state.equipped?.[category]&&i.category===category):null;const name='club'+category[0].toUpperCase()+category.slice(1);if(item&&['moss','lilac'].includes(item.effect))document.body.dataset[name]=item.effect;else delete document.body.dataset[name];}
  }
  window.addEventListener('pageshow',refresh);window.addEventListener('starosta-access-updated',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});refresh();
})();
