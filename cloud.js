/* Shared journal. Keys live only in this tab's memory and are verified by the server. */
(()=>{
  let token='', revision=0, ready=false, dirty=false, writing=false, conflict=false, timer;
  let localBackup=null;
  const localCopy=new JournalLocalCopy(store,KEY);
  const privacyError=()=>status('Не удалось очистить копию устройства. Очисти данные сайта в браузере.');
  const safeActions=new Set(['back','dshift','today','openatt','attreport','daysum','openwork','workreport','openfund','fundreport','openstud','msgstud','risk','syncbgtu','gobgtu','openbgtu','godir','gotpl','csvatt','csvworks','backup','setweek']);
  window.cloudCanEdit=()=>ready && !!token && !conflict;
  window.cloudScheduleBlocked=()=>!!token && conflict;
  const panel=document.createElement('section');panel.id='cloud-panel';
  panel.innerHTML='<div><b>Общий журнал</b><p id="cloud-status" role="status" aria-live="polite">Просмотр · войди по ключу для доступа к журналу</p></div><form id="cloud-login"><input id="cloud-key" type="password" autocomplete="off" placeholder="Ключ доступа" aria-label="Ключ доступа" required><button>Войти</button></form><details id="cloud-tools" hidden><summary>Управление журналом</summary><label><input id="cloud-offline" type="checkbox"> Сохранять офлайн-копию на устройстве до выхода</label><div class="cloud-buttons"><button id="cloud-pull">Загрузить из облака</button><button id="cloud-push">Повторить сохранение</button><button id="cloud-import">Перенести данные с этого устройства</button><button id="cloud-draft">Скачать несохранённое</button><button id="cloud-logout">Выйти</button></div></details>';
  document.body.insertBefore(panel,document.getElementById('app'));
  const offline=document.getElementById('cloud-offline');
  offline.onchange=async()=>{try{await localCopy.setEnabled(offline.checked);if(offline.checked&&ready)await localCopy.save(JSON.stringify(S));}catch{privacyError();}};
  const recovery=document.createElement('button');recovery.textContent='Скачать черновик устройства';
  recovery.onclick=async()=>{const draft=await store.get(KEY+'-cloud-draft');if(!draft)return status('На этом устройстве черновика нет');download('starosta-device-draft.json',draft,'application/json');};
  document.querySelector('.cloud-buttons').append(recovery);
  const style=document.createElement('style');style.textContent=`
  #cloud-panel{margin:16px auto;padding:16px;max-width:760px;border:1px solid var(--stroke-out);border-radius:18px;background:var(--glass-hi);color:var(--ink)}
  #cloud-panel p{font-size:13px;overflow-wrap:anywhere;margin:6px 0 12px}#cloud-panel form,#cloud-tools .cloud-buttons{display:flex;gap:8px;flex-wrap:wrap}#cloud-panel input{min-width:0;flex:1 1 170px;padding:12px;border-radius:10px;background:var(--glass-lo);color:var(--ink);border:1px solid var(--stroke-out)}#cloud-panel button{padding:10px 14px;min-height:44px;border-radius:10px;border:1px solid var(--stroke-out);background:var(--accent-soft);color:var(--ink)}
  body.cloud-reader nav button[data-tab="group"],body.cloud-reader nav button[data-tab="money"],body.cloud-reader nav button[data-tab="works"]{display:none}
  #cloud-tools summary{cursor:pointer;padding:8px 0;color:var(--accent)}body.cloud-reader [data-editor-only],body.cloud-reader li.card:has(> .lesson[data-editor-only]){display:none!important}body.cloud-reader input[data-act],body.cloud-reader textarea[data-act]{pointer-events:none;opacity:.65}button:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}button{touch-action:manipulation}#app{overflow-wrap:anywhere}@media(max-width:480px){#cloud-panel{margin:10px 12px}#cloud-panel button{flex-grow:1}}
  `;document.head.append(style);
  const status=message=>document.getElementById('cloud-status').textContent=message;
  function permissions(){
    document.body.classList.toggle('cloud-reader',!window.cloudCanEdit());
    document.querySelectorAll('#app [data-act]').forEach(el=>{if(!safeActions.has(el.dataset.act))el.setAttribute('data-editor-only','');});
    document.getElementById('cloud-login').hidden=!!token;
    document.getElementById('cloud-tools').hidden=!token;
  }
  new MutationObserver(permissions).observe(document.getElementById('app'),{childList:true,subtree:true});
  for(const type of ['click','change','input'])document.addEventListener(type,e=>{
    const el=e.target.closest('#app [data-act]');
    if(el && !safeActions.has(el.dataset.act) && !window.cloudCanEdit()) {e.preventDefault();e.stopImmediatePropagation();toast('Редактирование доступно после входа по ключу');}
  },true);
  async function api(route,options={}){
    const sessionToken=token;
    if(window.STAROSTA_SUPABASE_URL){
      const body=options.body?JSON.parse(options.body):{};
      const response=await fetch(window.STAROSTA_SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/rpc/starosta_state',{
        method:'POST',headers:{'Content-Type':'application/json',apikey:window.STAROSTA_SUPABASE_KEY},
        body:JSON.stringify({access_key:token,operation:route==='/api/session'?'session':options.method==='PUT'?'write':'read',expected_revision:body.revision??null,payload:body.data??null}),signal:AbortSignal.timeout(20000)
      });
      const result=await response.json();if(sessionToken!==token)throw new Error('Сессия изменена');if(!response.ok){const error=new Error(result.message||'Ошибка облачного хранилища');error.status=response.status;throw error;}return result;
    }
    const response=await fetch((window.STAROSTA_API||'')+route,{...options,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(20000)});
    let data;try{data=await response.json();}catch{throw new Error('Сервер не подключён. Настрой адрес в config.js.');}
    if(sessionToken!==token)throw new Error('Сессия изменена');
    if(!response.ok){const error=new Error(data.error||'Ошибка сервера');error.status=response.status;throw error;}return data;
  }
  async function pull(){
    const data=await api('/api/state');revision=data.revision;
    S=data.data?Object.assign(fresh(),data.data):fresh();dirty=false;conflict=false;ready=true;
    status(data.data?'Загружено из облака · редактирование разрешено':'Облако пустое · добавь группу или перенеси данные устройства');
    permissions();render();await loadScheduleSnapshot();
  }
  async function push(){
    if(!dirty||writing||!window.cloudCanEdit())return;
    writing=true;dirty=false;const snapshot=JSON.stringify(S);status('Сохраняю в облако…');
    try{const data=await api('/api/state',{method:'PUT',body:JSON.stringify({revision,data:JSON.parse(snapshot)})});revision=data.revision;status('Сохранено в облаке · '+new Date(data.updatedAt).toLocaleTimeString('ru-RU'));}
    catch(error){dirty=true;if(error.status===409){conflict=true;permissions();}status(error.message+' Скачай несохранённое перед загрузкой из облака.');}
    finally{writing=false;if(dirty&&!conflict) { /* Retry is explicit after a failure, preserving the draft. */ }}
    if(!dirty)return;
  }
  window.cloudSave=()=>{
    if(!window.cloudCanEdit())return;
    dirty=true;localCopy.save(JSON.stringify(S)).catch(privacyError);
    clearTimeout(timer);timer=setTimeout(async()=>{if(writing){timer=setTimeout(window.cloudSave,300);return;}await push();},350);
  };
  window.cloudInit=async()=>{localBackup=JSON.parse(JSON.stringify(S));offline.checked=await localCopy.init();S=fresh();permissions();status('Без ключа доступно расписание БГТУ. Журнал группы откроется после входа.');await loadScheduleSnapshot();};
  document.getElementById('cloud-login').onsubmit=async e=>{
    e.preventDefault();token=document.getElementById('cloud-key').value.trim();document.getElementById('cloud-key').value='';status('Проверяю ключ…');
    try{await api('/api/session');await pull();}catch(error){token='';ready=false;status(error.message);permissions();}
  };
  document.getElementById('cloud-pull').onclick=async()=>{if(writing)return status('Дождись завершения сохранения');if(dirty&&!await askConfirm('Заменить несохранённые изменения облачной версией? Сначала можно скачать их.'))return;try{await pull();}catch(e){status(e.message);}};
  document.getElementById('cloud-push').onclick=()=>push();
  document.getElementById('cloud-draft').onclick=()=>download('starosta-draft-'+todayISO()+'.json',JSON.stringify(S),'application/json');
  document.getElementById('cloud-import').onclick=async()=>{if(!window.cloudCanEdit())return;if(!await askConfirm('Заменить общий журнал данными, сохранёнными на этом устройстве до входа?'))return;S=JSON.parse(JSON.stringify(localBackup));save();render();};
  document.getElementById('cloud-logout').onclick=async()=>{if(writing)return status('Дождись завершения сохранения');if(dirty&&!await askConfirm('Выйти с несохранёнными изменениями? Сначала можно скачать их.'))return;token='';ready=false;dirty=false;conflict=false;clearTimeout(timer);S=fresh();localBackup=null;view=null;ctx={};offline.checked=false;permissions();render();try{await localCopy.logout();status('Выход выполнен · журнал и копия устройства очищены');}catch{privacyError();}};
  window.addEventListener('beforeunload',e=>{if(dirty||writing){e.preventDefault();e.returnValue='';}});
  setInterval(async()=>{if(!ready||dirty||writing||conflict||window.modalPending||document.hidden||document.activeElement?.matches('input,textarea,select'))return;const requestedRevision=revision;try{const data=await api('/api/state');if(!ready||dirty||writing||conflict||window.modalPending||revision!==requestedRevision)return;if(data.revision!==revision){revision=data.revision;S=Object.assign(fresh(),data.data||{});render();status('Получены изменения с другого устройства');}}catch(e){status('Облако недоступно · '+e.message);}},15000);
  permissions();
  startApp().catch(error=>status('Не удалось запустить приложение: '+error.message));
})();
