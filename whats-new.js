// Shared by both interfaces; all changelog content is rendered as text.
(()=>{
  const WHATS_NEW_VERSION='ui-modes-1';
  const WHATS_NEW_STORAGE_KEY='starosta-whats-new-seen';
  const items=[
    'Добавлен новый интерфейс приложения.',
    'Переключаться между старым и новым интерфейсом можно в разделе «Ещё».',
    'Выбранный режим сохраняется после перезагрузки.',
  ];
  let ready=false, pending=false, shown=false, previousFocus;
  const modal=document.createElement('dialog');
  modal.id='whats-new-dialog';
  modal.setAttribute('aria-labelledby','whats-new-title');
  modal.setAttribute('aria-describedby','whats-new-items');
  const title=document.createElement('h2');title.id='whats-new-title';title.textContent='Что нового';
  const list=document.createElement('ul');list.id='whats-new-items';
  for(const text of items){const li=document.createElement('li');li.textContent=text;list.append(li);}
  const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Понятно';
  button.addEventListener('click',()=>modal.close());
  modal.append(title,list,button);document.body.append(modal);
  const style=document.createElement('style');
  style.textContent='#whats-new-dialog{box-sizing:border-box;width:min(420px,calc(100% - 32px));max-height:85dvh;overflow:auto;padding:24px;border:1px solid var(--line,var(--stroke-out));border-radius:var(--r-lg,20px);background:var(--surface,var(--glass-hi));color:var(--ink);backdrop-filter:blur(28px)}#whats-new-dialog::backdrop{background:rgba(0,0,0,.55)}#whats-new-title{margin:0 0 16px;font-size:1.25rem}#whats-new-items{display:block;padding:0 0 0 20px;margin:0 0 20px;list-style:disc}#whats-new-items li{display:list-item;padding:0;margin:0 0 10px;border:0;background:none;overflow-wrap:anywhere}#whats-new-dialog button{width:100%}#whats-new-dialog button:focus-visible{outline:3px solid var(--accent,var(--ink));outline-offset:3px}';
  document.head.append(style);
  const seen=()=>{try{return localStorage.getItem(WHATS_NEW_STORAGE_KEY)===WHATS_NEW_VERSION;}catch{return false;}};
  function show(manual=false){
    if(!ready||modal.open||(!manual&&(shown||seen())))return false;
    if(document.querySelector('dialog[open]')){if(!manual)pending=true;return false;}
    previousFocus=document.activeElement;
    try{modal.showModal();}catch{return false;}
    if(!modal.open)return false;
    shown=true;pending=false;button.focus();
    try{localStorage.setItem(WHATS_NEW_STORAGE_KEY,WHATS_NEW_VERSION);}catch{}
    return true;
  }
  modal.addEventListener('close',()=>{if(previousFocus?.isConnected)previousFocus.focus();});
  // Native dialog handles Escape and focus trapping, like the existing dialogs.
  document.addEventListener('close',()=>{if(pending)show();},true);
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-whats-new]'))show(true);
  });
  window.whatsNewReady=()=>{ready=true;show();};
})();
