/* Shared journal. Keys live only in this tab's memory and are verified by the server. */
(()=>{
  let token='', revision=0, ready=false, dirty=false, writing=false, conflict=false, timer;
  let localBackup=null;
  const localCopy=new JournalLocalCopy(store,KEY);
  const privacyError=()=>status('Не удалось очистить копию устройства. Очисти данные сайта в браузере.');
  const safeActions=new Set(['back','dshift','today','openatt','attreport','daysum','openwork','workreport','openfund','fundreport','openstud','msgstud','risk','syncbgtu','gobgtu','gosemester','openbgtu','godir','gotpl','csvatt','csvworks','backup','setweek','cloudlogin']);
  window.cloudHasSession=()=>ready && !!token;
  window.cloudCanEdit=()=>ready && !!token && !conflict;
  window.cloudScheduleBlocked=()=>!!token && conflict;

  /* Диалог входа старосты — поверх публичной версии, без перезагрузки страницы. */
  const dlg=document.createElement('dialog');dlg.id='cloud-login-dialog';
  dlg.innerHTML='<form id="cloud-login" novalidate><h2>Вход старосты</h2><p id="cloud-status" role="status" aria-live="polite">Полный журнал группы откроется после ключа доступа</p><div class="field"><label for="cloud-key">Ключ доступа</label><input id="cloud-key" type="password" autocomplete="off" aria-describedby="cloud-error" required><p class="field-error" id="cloud-error" hidden></p></div><div class="row dialog-actions"><button class="btn ghost" type="button" id="cloud-cancel">Отмена</button><button class="btn" type="submit">Войти</button></div></form>';
  document.body.append(dlg);
  document.getElementById('cloud-cancel').onclick=()=>dlg.close('cancel');

  /* Компактная панель статуса — только для вошедшего старосты. */
  const strip=document.createElement('section');strip.id='cloud-strip';strip.hidden=true;
  strip.innerHTML='<div class="cloud-role">Староста</div><p id="cloud-strip-status" role="status" aria-live="polite"></p><details id="cloud-tools"><summary aria-label="Управление журналом"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01"/></svg></summary><label><input id="cloud-offline" type="checkbox"> Сохранять офлайн-копию на устройстве до выхода</label><div class="cloud-buttons"><button id="cloud-pull">Загрузить из облака</button><button id="cloud-push">Повторить сохранение</button><button id="cloud-import">Перенести данные с этого устройства</button><button id="cloud-draft">Скачать несохранённое</button><button id="cloud-logout">Выйти</button></div></details>';
  document.body.insertBefore(strip,document.getElementById('app'));
  const offline=document.getElementById('cloud-offline');
  offline.onchange=async()=>{try{await localCopy.setEnabled(offline.checked);if(offline.checked&&ready)await localCopy.save(JSON.stringify(S));}catch{privacyError();}};
  const recovery=document.createElement('button');recovery.textContent='Скачать черновик устройства';
  recovery.onclick=async()=>{const draft=await store.get(KEY+'-cloud-draft');if(!draft)return status('На этом устройстве черновика нет');download('starosta-device-draft.json',draft,'application/json');};
  document.querySelector('.cloud-buttons').append(recovery);
  const status=message=>{document.getElementById('cloud-status').textContent=message;document.getElementById('cloud-strip-status').textContent=message;};
  let wasEditor=null;
  function permissions(){
    const editing=window.cloudCanEdit();
    document.body.classList.toggle('cloud-reader',!editing);
    document.body.classList.toggle('cloud-editor',editing);
    if(wasEditor!==null&&editing!==wasEditor){
      const app=document.getElementById('app');
      app.classList.remove('reveal');void app.offsetWidth;app.classList.add('reveal');
    }
    wasEditor=editing;
    document.querySelectorAll('#app [data-act]').forEach(el=>{if(!safeActions.has(el.dataset.act))el.setAttribute('data-editor-only','');});
    strip.hidden=!token;
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
      const response=await window.starostaSupabaseFetch('/rest/v1/rpc/starosta_state',{
        method:'POST',headers:{'Content-Type':'application/json',apikey:window.STAROSTA_SUPABASE_KEY},
        body:JSON.stringify({access_key:token,operation:route==='/api/session'?'session':options.method==='PUT'?'write':'read',expected_revision:body.revision??null,payload:body.data??null})
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
  window.cloudInit=async()=>{localBackup=JSON.parse(JSON.stringify(S));offline.checked=await localCopy.init();S=fresh();permissions();status('Без ключа доступно расписание БГТУ. Журнал группы откроется после входа.');loadScheduleSnapshot();};
  document.getElementById('cloud-login').onsubmit=async e=>{
    e.preventDefault();
    const keyInput=document.getElementById('cloud-key');
    token=keyInput.value.trim();keyInput.value='';status('Проверяю ключ…');
    const err=document.getElementById('cloud-error');
    try{await api('/api/session');err.hidden=true;dlg.close('ok');await pull();}
    catch(error){token='';ready=false;permissions();err.textContent=error.message;err.hidden=false;keyInput.focus();}
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
